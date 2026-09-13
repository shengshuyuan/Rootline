import type { FamilyTree, PartnerRelationship, Person } from '../../types'

export type FamilyViewMode = 'lineage' | 'full'

export interface LayoutPoint {
  x: number
  y: number
}

/**
 * Must match the CSS person-card size used by the canvas. Layout math uses the
 * visual center of each card, not the top-left origin React Flow stores.
 */
export const PERSON_NODE_WIDTH = 178
export const PERSON_NODE_HEIGHT = 88
export const JUNCTION_SIZE = 10
/** Horizontal gap between sibling top-left origins (card width + gutter). */
export const NODE_GAP_X = 220
export const UNIT_GAP_X = 52
/** Vertical distance between generation top-left origins. */
export const ROW_GAP_Y = 190

/**
 * A presentation-only graph.  The UI is responsible for translating these
 * descriptors into React Flow nodes and edges; no view-library types leak into
 * the domain layer.
 */
export interface FamilyLayoutNode {
  id: string
  kind: 'person' | 'junction'
  position: LayoutPoint
  personId?: string
}

export type FamilyLayoutEdgeKind = 'partner' | 'parent-child' | 'parent-to-junction' | 'junction-to-child'

export interface FamilyLayoutEdge {
  id: string
  kind: FamilyLayoutEdgeKind
  source: string
  target: string
  sourceHandle?: 'parent-top' | 'child-bottom' | 'partner-left' | 'partner-right'
  targetHandle?: 'parent-top' | 'child-bottom' | 'partner-left' | 'partner-right'
  relationshipId?: string
}

export interface FamilyLayoutOptions {
  centerId?: string
  collapsed?: ReadonlySet<string>
  mode?: FamilyViewMode
}

export interface FamilyLayout {
  nodes: FamilyLayoutNode[]
  edges: FamilyLayoutEdge[]
  visiblePersonIds: Set<string>
  hiddenPersonIds: Set<string>
}

const otherPartner = (relationship: PartnerRelationship, id: string) =>
  relationship.person1Id === id ? relationship.person2Id : relationship.person1Id

const personIndex = (tree: FamilyTree) => new Map(tree.persons.map((person, index) => [person.id, index]))

/** Visual center of a person card given its top-left layout origin. */
export function personCenter(position: LayoutPoint): LayoutPoint {
  return {
    x: position.x + PERSON_NODE_WIDTH / 2,
    y: position.y + PERSON_NODE_HEIGHT / 2,
  }
}

export function personBottomCenter(position: LayoutPoint): LayoutPoint {
  return {
    x: position.x + PERSON_NODE_WIDTH / 2,
    y: position.y + PERSON_NODE_HEIGHT,
  }
}

/** Parents in the same marital unit as personId (self + visible MVP spouse). */
function familyUnitParentIds(tree: FamilyTree, personId: string): string[] {
  const ids = new Set<string>([personId])
  tree.partnerRelationships.forEach((relationship) => {
    if (relationship.person1Id === personId) ids.add(relationship.person2Id)
    if (relationship.person2Id === personId) ids.add(relationship.person1Id)
  })
  return [...ids]
}

/** Children recorded against anyone in the marital unit (either spouse may hold the edge). */
function childrenOfFamilyUnit(tree: FamilyTree, personId: string) {
  const parents = new Set(familyUnitParentIds(tree, personId))
  return tree.parentChildRelationships.filter((relationship) => parents.has(relationship.parentId))
}

/**
 * 主脉 = 父系主脉中的亲生后代：
 * - 向上：只沿已记录的亲生父亲关系回溯；
 * - 向下：主脉男性的亲生儿子、女儿都保留（同代平等）；
 * - 女儿保留为主脉成员，但不再展开其子女；儿子继续展开其后代；
 * - 配偶、继亲、收养及其他非亲生关系不计入主脉。
 *
 * 当前中心人物始终保留，以便从完整关系中定位；若其不在上述规则内，
 * 它只作为观察锚点，不会把该分支误扩展进主脉。
 */
function collectLineageIds(tree: FamilyTree, centerId: string): Set<string> {
  const included = new Set<string>([centerId])
  const byId = new Map(tree.persons.map((person) => [person.id, person]))

  const isMale = (personId: string) => byId.get(personId)?.gender === 'male'

  const biologicalFatherOf = (childId: string) =>
    tree.parentChildRelationships.filter((relationship) => {
      if (relationship.childId !== childId) return false
      if (relationship.relationshipType !== 'biological') return false
      if (relationship.parentRole === 'father') return true
      // Old imports may not have a role, but a recorded biological male parent
      // is still safer than dropping a valid historical father chain.
      return relationship.parentRole === 'unknown' && isMale(relationship.parentId)
    })

  const biologicalChildrenOfMan = (parentId: string) =>
    tree.parentChildRelationships
      .filter((relationship) => relationship.parentId === parentId && relationship.relationshipType === 'biological')
      .map((relationship) => relationship.childId)

  const includeMaleAncestors = (id: string) => {
    biologicalFatherOf(id).forEach((relationship) => {
      if (included.has(relationship.parentId)) return
      included.add(relationship.parentId)
      includeMaleAncestors(relationship.parentId)
    })
  }
  includeMaleAncestors(centerId)

  // A main-line man passes the branch to all of his biological children.  A
  // daughter is therefore visible, but deliberately never enters this queue.
  const queue = [...included]
  while (queue.length) {
    const current = queue.shift()!
    if (!isMale(current)) continue
    biologicalChildrenOfMan(current).forEach((childId) => {
      if (included.has(childId)) return
      included.add(childId)
      if (isMale(childId)) queue.push(childId)
    })
  }

  return included
}

/**
 * Only explicit collapse hides people. Descendants of a collapsed person include
 * children linked to them or to their spouse (same family unit).
 */
function descendantsOf(tree: FamilyTree, collapsed: ReadonlySet<string>): Set<string> {
  const hidden = new Set<string>()
  const visit = (id: string) => {
    childrenOfFamilyUnit(tree, id).forEach((relationship) => {
      if (hidden.has(relationship.childId)) return
      hidden.add(relationship.childId)
      visit(relationship.childId)
    })
  }
  collapsed.forEach(visit)
  return hidden
}

function assignGenerations(tree: FamilyTree, visible: Set<string>, centerId: string): Map<string, number> {
  const generations = new Map<string, number>()
  const byPerson = new Map<string, Array<{ id: string; delta: number }>>()
  const add = (from: string, to: string, delta: number) => {
    if (!visible.has(from) || !visible.has(to)) return
    byPerson.set(from, [...(byPerson.get(from) ?? []), { id: to, delta }])
  }
  tree.parentChildRelationships.forEach((relationship) => {
    add(relationship.parentId, relationship.childId, 1)
    add(relationship.childId, relationship.parentId, -1)
  })
  tree.partnerRelationships.forEach((relationship) => {
    add(relationship.person1Id, relationship.person2Id, 0)
    add(relationship.person2Id, relationship.person1Id, 0)
  })

  const seed = (id: string, generation: number) => {
    if (!visible.has(id) || generations.has(id)) return
    generations.set(id, generation)
    const queue = [id]
    while (queue.length) {
      const current = queue.shift()!
      const level = generations.get(current)!
      ;(byPerson.get(current) ?? []).forEach(({ id: nextId, delta }) => {
        if (!generations.has(nextId)) {
          generations.set(nextId, level + delta)
          queue.push(nextId)
        }
      })
    }
  }
  seed(centerId, 0)
  visible.forEach((id) => seed(id, 0))
  return generations
}

interface FamilyUnit {
  people: Person[]
  partner?: PartnerRelationship
  order: number
}

function familyUnits(tree: FamilyTree, people: Person[], visible: Set<string>): FamilyUnit[] {
  const index = personIndex(tree)
  const partnerById = new Map<string, PartnerRelationship>()
  tree.partnerRelationships.forEach((relationship) => {
    if (visible.has(relationship.person1Id) && visible.has(relationship.person2Id)) {
      partnerById.set(relationship.person1Id, relationship)
      partnerById.set(relationship.person2Id, relationship)
    }
  })
  const consumed = new Set<string>()
  const units: FamilyUnit[] = []
  people.forEach((person) => {
    if (consumed.has(person.id)) return
    const partner = partnerById.get(person.id)
    const partnerId = partner && otherPartner(partner, person.id)
    const partnerPerson = partnerId ? people.find((candidate) => candidate.id === partnerId) : undefined
    if (partner && partnerPerson) {
      const pair = [person, partnerPerson].sort((a, b) => (index.get(a.id)! - index.get(b.id)!))
      consumed.add(pair[0].id)
      consumed.add(pair[1].id)
      units.push({ people: pair, partner, order: Math.min(index.get(pair[0].id)!, index.get(pair[1].id)!) })
    } else {
      consumed.add(person.id)
      units.push({ people: [person], order: index.get(person.id)! })
    }
  })
  return units
}

/**
 * Recorded parents plus any visible spouse of those parents.
 * Children hang under the marital unit, not only under the parent who was clicked.
 */
export function visualParentIds(
  tree: FamilyTree,
  childId: string,
  visible: ReadonlySet<string>,
): string[] {
  const recorded = tree.parentChildRelationships
    .filter((relationship) => relationship.childId === childId && visible.has(relationship.parentId))
    .map((relationship) => relationship.parentId)
  const expanded = new Set(recorded)
  tree.partnerRelationships.forEach((relationship) => {
    if (!visible.has(relationship.person1Id) || !visible.has(relationship.person2Id)) return
    if (expanded.has(relationship.person1Id)) expanded.add(relationship.person2Id)
    if (expanded.has(relationship.person2Id)) expanded.add(relationship.person1Id)
  })
  return [...expanded].sort()
}

function parentUnitKey(parentIds: string[]): string {
  return [...parentIds].sort().join(':')
}

function average(values: number[]): number | undefined {
  if (!values.length) return undefined
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

/**
 * Place family units on a generation row.
 * Siblings that share the same visual parent unit are packed as one block and
 * centered under that parental couple — using card centers, not top-left origins.
 */
function placeUnitsOnRow(
  tree: FamilyTree,
  units: FamilyUnit[],
  visible: ReadonlySet<string>,
  positions: Map<string, LayoutPoint>,
  y: number,
  nodes: FamilyLayoutNode[],
): void {
  type Prepared = {
    unit: FamilyUnit
    parentKey: string | null
    idealCenter: number | undefined
    order: number
  }

  const prepared: Prepared[] = units.map((unit) => {
    const parentIds = visualParentIds(tree, unit.people[0].id, visible)
    const parentCenters = parentIds
      .map((id) => positions.get(id))
      .filter((position): position is LayoutPoint => Boolean(position))
      .map((position) => personCenter(position).x)
    return {
      unit,
      parentKey: parentIds.length ? parentUnitKey(parentIds) : null,
      idealCenter: average(parentCenters),
      order: unit.order,
    }
  })

  const anchored = new Map<string, Prepared[]>()
  const floating: Prepared[] = []
  prepared.forEach((item) => {
    if (item.parentKey && item.idealCenter !== undefined) {
      anchored.set(item.parentKey, [...(anchored.get(item.parentKey) ?? []), item])
    } else {
      floating.push(item)
    }
  })

  const groups = [
    ...[...anchored.entries()].map(([key, members]) => ({
      key,
      members: members.sort((left, right) => left.order - right.order),
      idealCenter: members[0].idealCenter as number,
    })),
    ...floating
      .sort((left, right) => left.order - right.order)
      .map((item, index) => ({
        key: `free:${index}`,
        members: [item],
        idealCenter: undefined as number | undefined,
      })),
  ].sort((left, right) => {
    if (left.idealCenter !== undefined && right.idealCenter !== undefined) {
      return left.idealCenter - right.idealCenter || left.key.localeCompare(right.key)
    }
    if (left.idealCenter !== undefined) return -1
    if (right.idealCenter !== undefined) return 1
    return left.key.localeCompare(right.key)
  })

  const placeUnit = (unit: FamilyUnit, firstX: number) => {
    unit.people.forEach((person, index) => {
      const position = { x: firstX + index * NODE_GAP_X, y }
      positions.set(person.id, position)
      nodes.push({ id: person.id, kind: 'person', personId: person.id, position })
    })
    return firstX + unit.people.length * NODE_GAP_X
  }

  let cursor = Number.NEGATIVE_INFINITY
  groups.forEach((group) => {
    const personCount = group.members.reduce((sum, member) => sum + member.unit.people.length, 0)
    // Midpoint of first/last card centers should sit on idealCenter.
    const firstToLastCenter = Math.max(0, (personCount - 1) * NODE_GAP_X)
    let startX = group.idealCenter !== undefined
      ? group.idealCenter - firstToLastCenter / 2 - PERSON_NODE_WIDTH / 2
      : (Number.isFinite(cursor) ? cursor : 0)

    if (Number.isFinite(cursor) && startX < cursor) startX = cursor

    let x = startX
    group.members.forEach((member) => {
      x = placeUnit(member.unit, x)
    })
    cursor = x + UNIT_GAP_X
  })
}

/**
 * Place the shared junction for a parental unit so both parent→junction drops
 * meet at the same height, centered under the couple's card centers.
 */
function placeJunction(
  parentIds: string[],
  positions: Map<string, LayoutPoint>,
  childIds: string[],
): LayoutPoint {
  const parentPositions = parentIds
    .map((id) => positions.get(id))
    .filter((position): position is LayoutPoint => Boolean(position))
  const childPositions = childIds
    .map((id) => positions.get(id))
    .filter((position): position is LayoutPoint => Boolean(position))

  const centerX = average(parentPositions.map((position) => personCenter(position).x)) ?? 0
  const parentBottom = average(parentPositions.map((position) => personBottomCenter(position).y))
    ?? (parentPositions[0]?.y ?? 0) + PERSON_NODE_HEIGHT
  const childTop = average(childPositions.map((position) => position.y))
    ?? parentBottom + (ROW_GAP_Y - PERSON_NODE_HEIGHT)
  // Shared horizontal bar height: halfway between parent bottoms and child tops.
  const barY = (parentBottom + childTop) / 2

  return {
    x: centerX - JUNCTION_SIZE / 2,
    y: barY - JUNCTION_SIZE / 2,
  }
}

/** Builds a deterministic, framework-agnostic family graph for the canvas. */
export function layoutFamilyTree(tree: FamilyTree, options: FamilyLayoutOptions = {}): FamilyLayout {
  const centerId = options.centerId && tree.persons.some((person) => person.id === options.centerId)
    ? options.centerId
    : tree.rootPersonId ?? tree.persons[0]?.id
  if (!centerId) return { nodes: [], edges: [], visiblePersonIds: new Set(), hiddenPersonIds: new Set() }

  const included = options.mode === 'lineage'
    ? collectLineageIds(tree, centerId)
    : new Set(tree.persons.map((person) => person.id))
  const hiddenPersonIds = descendantsOf(tree, options.collapsed ?? new Set())
  const visiblePersonIds = new Set([...included].filter((id) => !hiddenPersonIds.has(id)))
  const generation = assignGenerations(tree, visiblePersonIds, centerId)
  const rows = new Map<number, Person[]>()
  tree.persons.filter((person) => visiblePersonIds.has(person.id)).forEach((person) => {
    const level = generation.get(person.id) ?? 0
    rows.set(level, [...(rows.get(level) ?? []), person])
  })

  const nodes: FamilyLayoutNode[] = []
  const positions = new Map<string, LayoutPoint>()
  const sortedRows = [...rows.entries()].sort(([left], [right]) => left - right)
  const firstLevel = sortedRows[0]?.[0] ?? 0

  sortedRows.forEach(([level, people]) => {
    const units = familyUnits(tree, people, visiblePersonIds)
    units.sort((left, right) => left.order - right.order)
    placeUnitsOnRow(
      tree,
      units,
      visiblePersonIds,
      positions,
      (level - firstLevel) * ROW_GAP_Y,
      nodes,
    )
  })

  const edges: FamilyLayoutEdge[] = []
  tree.partnerRelationships.forEach((relationship) => {
    if (!visiblePersonIds.has(relationship.person1Id) || !visiblePersonIds.has(relationship.person2Id)) return
    const left = positions.get(relationship.person1Id)!
    const right = positions.get(relationship.person2Id)!
    const source = left.x <= right.x ? relationship.person1Id : relationship.person2Id
    const target = source === relationship.person1Id ? relationship.person2Id : relationship.person1Id
    edges.push({
      id: `partner:${relationship.id}`,
      kind: 'partner',
      source,
      target,
      sourceHandle: 'partner-right',
      targetHandle: 'partner-left',
      relationshipId: relationship.id,
    })
  })

  const visibleParentRelationships = tree.parentChildRelationships.filter(
    (relationship) => visiblePersonIds.has(relationship.parentId) && visiblePersonIds.has(relationship.childId),
  )

  // Group children by their visual parent unit (recorded parents ∪ visible spouses).
  const childrenByUnit = new Map<string, { parentIds: string[]; childIds: string[]; relationshipIds: string[] }>()
  const seenChild = new Set<string>()

  visibleParentRelationships.forEach((relationship) => {
    if (seenChild.has(relationship.childId)) return
    const parentIds = visualParentIds(tree, relationship.childId, visiblePersonIds)
    if (!parentIds.length) return
    seenChild.add(relationship.childId)
    const key = parentUnitKey(parentIds)
    const bucket = childrenByUnit.get(key) ?? { parentIds, childIds: [], relationshipIds: [] }
    bucket.childIds.push(relationship.childId)
    const rel = visibleParentRelationships.find((candidate) => candidate.childId === relationship.childId)
    if (rel) bucket.relationshipIds.push(rel.id)
    childrenByUnit.set(key, bucket)
  })

  // Stable sibling order by placement x (then id); keep relationshipIds aligned.
  childrenByUnit.forEach((bucket) => {
    bucket.childIds.sort((left, right) => {
      const dx = (positions.get(left)?.x ?? 0) - (positions.get(right)?.x ?? 0)
      return dx !== 0 ? dx : left.localeCompare(right)
    })
    bucket.relationshipIds = bucket.childIds.map((childId) =>
      visibleParentRelationships.find((relationship) => relationship.childId === childId)?.id ?? '',
    )
  })

  const junctionByUnit = new Map<string, string>()
  const junctionChildEdges = new Set<string>()

  childrenByUnit.forEach(({ parentIds, childIds, relationshipIds }, key) => {
    if (parentIds.length < 2) {
      childIds.forEach((childId, index) => {
        const relationshipId = relationshipIds[index]
        const parentId = parentIds[0]
        edges.push({
          id: `parent:${relationshipId ?? `${parentId}:${childId}`}`,
          kind: 'parent-child',
          source: parentId,
          target: childId,
          sourceHandle: 'child-bottom',
          targetHandle: 'parent-top',
          relationshipId,
        })
      })
      return
    }

    let junctionId = junctionByUnit.get(key)
    if (!junctionId) {
      junctionId = `junction:${key}`
      junctionByUnit.set(key, junctionId)
      const junctionPosition = placeJunction(parentIds, positions, childIds)
      positions.set(junctionId, junctionPosition)
      nodes.push({ id: junctionId, kind: 'junction', position: junctionPosition })
      parentIds.forEach((parentId) => {
        edges.push({
          id: `junction-parent:${junctionId}:${parentId}`,
          kind: 'parent-to-junction',
          source: parentId,
          target: junctionId!,
          sourceHandle: 'child-bottom',
          targetHandle: 'parent-top',
        })
      })
    }

    childIds.forEach((childId, index) => {
      const childEdgeKey = `${junctionId}:${childId}`
      if (junctionChildEdges.has(childEdgeKey)) return
      junctionChildEdges.add(childEdgeKey)
      edges.push({
        id: `junction-child:${childEdgeKey}`,
        kind: 'junction-to-child',
        source: junctionId!,
        target: childId,
        sourceHandle: 'child-bottom',
        targetHandle: 'parent-top',
        relationshipId: relationshipIds[index],
      })
    })
  })

  return { nodes, edges, visiblePersonIds, hiddenPersonIds }
}
