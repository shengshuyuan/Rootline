import { describe, expect, it } from 'vitest'
import {
  addPartnerRelationship,
  addPerson,
  attachChildToParentUnit,
  createEmptyFamilyTree,
  layoutFamilyTree,
  NODE_GAP_X,
  PERSON_NODE_HEIGHT,
  PERSON_NODE_WIDTH,
  personCenter,
  removeParentChildRelationship,
  updatePerson,
} from '../src/domain'
import type { FamilyTree } from '../src/types'
import type { FamilyTreeRepository } from '../src/repository'

class MemoryRepository implements FamilyTreeRepository {
  constructor(private current: FamilyTree | null = null) {}
  load = async () => (this.current ? structuredClone(this.current) : null)
  save = async (tree: FamilyTree) => {
    this.current = structuredClone(tree)
  }
  replaceFromImport = async (tree: FamilyTree) => {
    this.current = structuredClone(tree)
  }
  export = async () => this.load()
}

/** Build the exact nuclear family from the user's screenshots. */
function buildCoupleWithTwoChildren() {
  let tree = createEmptyFamilyTree('盛氏回归', { surname: '盛' })
  tree = addPerson(tree, { name: '李开善', gender: 'female', isDeceased: true, birth: { value: '1921', precision: 'year' } })
  tree = addPerson(tree, { name: '盛义明', gender: 'male', isDeceased: false, birth: { value: '1918-08-21', precision: 'exact', calendar: 'solar' } })
  const [mother, father] = tree.persons
  tree = addPartnerRelationship(tree, { person1Id: mother.id, person2Id: father.id, relationshipType: 'married' })

  tree = addPerson(tree, {
    name: '盛森林',
    gender: 'male',
    isDeceased: false,
    birth: { value: '1940-08-16', precision: 'exact', calendar: 'lunar', originalText: '农历 1940-08-16' },
  })
  const childA = tree.persons[2]
  tree = attachChildToParentUnit(tree, mother.id, childA.id)

  tree = addPerson(tree, {
    name: '盛香米',
    gender: 'male',
    isDeceased: false,
    birth: { value: '1948-03-16', precision: 'exact', calendar: 'solar' },
  })
  const childB = tree.persons[3]
  // Add second child from the *father* side — must still attach the whole unit.
  tree = attachChildToParentUnit(tree, father.id, childB.id)
  tree = { ...tree, rootPersonId: mother.id }
  return { tree, mother, father, childA: tree.persons[2], childB: tree.persons[3] }
}

describe('core family unit geometry', () => {
  it('places spouses on one row with a level junction under card centers', () => {
    const { tree, mother, father, childA, childB } = buildCoupleWithTwoChildren()
    const graph = layoutFamilyTree(tree, { centerId: mother.id, mode: 'full' })
    const pos = new Map(graph.nodes.filter((n) => n.kind === 'person').map((n) => [n.id, n.position]))
    const junction = graph.nodes.find((n) => n.kind === 'junction')
    expect(junction).toBeTruthy()

    // Same generation for spouses.
    expect(pos.get(mother.id)!.y).toBe(pos.get(father.id)!.y)
    // Adjacent cards.
    expect(Math.abs(pos.get(mother.id)!.x - pos.get(father.id)!.x)).toBe(NODE_GAP_X)

    const coupleCenterX = (
      personCenter(pos.get(mother.id)!).x + personCenter(pos.get(father.id)!).x
    ) / 2
    const junctionCenterX = junction!.position.x + 5 // JUNCTION_SIZE/2
    expect(junctionCenterX).toBeCloseTo(coupleCenterX, 5)

    // Both parents share the same bottom Y → parent→junction drops are level.
    expect(pos.get(mother.id)!.y + PERSON_NODE_HEIGHT).toBe(pos.get(father.id)!.y + PERSON_NODE_HEIGHT)
    // Junction sits strictly between parent bottoms and child tops.
    const parentBottom = pos.get(mother.id)!.y + PERSON_NODE_HEIGHT
    const childTop = pos.get(childA.id)!.y
    const junctionCenterY = junction!.position.y + 5
    expect(junctionCenterY).toBeGreaterThan(parentBottom)
    expect(junctionCenterY).toBeLessThan(childTop)

    // Children share a row and sit as a centered sibling pack under the couple.
    expect(pos.get(childA.id)!.y).toBe(pos.get(childB.id)!.y)
    const siblingMid = (
      personCenter(pos.get(childA.id)!).x + personCenter(pos.get(childB.id)!).x
    ) / 2
    expect(siblingMid).toBeCloseTo(coupleCenterX, 5)

    // Exactly one parent→junction per parent, one junction→child per child.
    expect(graph.edges.filter((e) => e.kind === 'parent-to-junction')).toHaveLength(2)
    expect(graph.edges.filter((e) => e.kind === 'junction-to-child')).toHaveLength(2)
    expect(graph.edges.filter((e) => e.kind === 'parent-child')).toHaveLength(0)
  })

  it('shows both children when center is either spouse in full view', () => {
    const { tree, mother, father, childA, childB } = buildCoupleWithTwoChildren()
    for (const centerId of [mother.id, father.id]) {
      const graph = layoutFamilyTree(tree, { centerId, mode: 'full' })
      expect(graph.visiblePersonIds.has(childA.id)).toBe(true)
      expect(graph.visiblePersonIds.has(childB.id)).toBe(true)
      expect(graph.visiblePersonIds.has(mother.id)).toBe(true)
      expect(graph.visiblePersonIds.has(father.id)).toBe(true)
    }
  })

  it('lineage from father keeps sons only; excludes wife and does not require mother center', () => {
    const { tree, mother, father, childA, childB } = buildCoupleWithTwoChildren()
    // Both children are male in this fixture
    const fromFather = layoutFamilyTree(tree, { centerId: father.id, mode: 'lineage' })
    expect(fromFather.visiblePersonIds.has(father.id)).toBe(true)
    expect(fromFather.visiblePersonIds.has(childA.id)).toBe(true)
    expect(fromFather.visiblePersonIds.has(childB.id)).toBe(true)
    expect(fromFather.visiblePersonIds.has(mother.id)).toBe(false)

    // Mother as center: she is the anchor only; sons recorded on her edges may appear,
    // but husband is spouse and stays out of 主脉.
    const fromMother = layoutFamilyTree(tree, { centerId: mother.id, mode: 'lineage' })
    expect(fromMother.visiblePersonIds.has(mother.id)).toBe(true)
    expect(fromMother.visiblePersonIds.has(father.id)).toBe(false)
  })

  it('only hides descendants after explicit collapse — not by changing center', () => {
    const { tree, mother, father, childA, childB } = buildCoupleWithTwoChildren()
    const open = layoutFamilyTree(tree, { centerId: father.id, mode: 'full' })
    expect(open.visiblePersonIds.has(childA.id)).toBe(true)

    const collapsedMother = layoutFamilyTree(tree, {
      centerId: father.id,
      mode: 'full',
      collapsed: new Set([mother.id]),
    })
    expect(collapsedMother.hiddenPersonIds.has(childA.id)).toBe(true)
    expect(collapsedMother.hiddenPersonIds.has(childB.id)).toBe(true)
    expect(collapsedMother.visiblePersonIds.has(mother.id)).toBe(true)
    expect(collapsedMother.visiblePersonIds.has(father.id)).toBe(true)
  })
})

describe('attach + multi-child data integrity', () => {
  it('links both spouses for every child, even when added from opposite parents', () => {
    const { tree, mother, father, childA, childB } = buildCoupleWithTwoChildren()
    const parentsOf = (childId: string) =>
      tree.parentChildRelationships
        .filter((r) => r.childId === childId)
        .map((r) => r.parentId)
        .sort()

    expect(parentsOf(childA.id)).toEqual([father.id, mother.id].sort())
    expect(parentsOf(childB.id)).toEqual([father.id, mother.id].sort())
    // No duplicate parent edges.
    expect(tree.parentChildRelationships).toHaveLength(4)
  })

  it('survives create → spouse → two kids → edit date → unlink → reload', async () => {
    const repository = new MemoryRepository()
    const built = buildCoupleWithTwoChildren()
    let tree = updatePerson(built.tree, built.mother.id, {
      birth: { value: '1921-01-01', precision: 'exact', calendar: 'solar' },
    })
    await repository.save(tree)

    const edge = tree.parentChildRelationships.find(
      (r) => r.parentId === built.father.id && r.childId === built.childB.id,
    )!
    tree = removeParentChildRelationship(tree, edge.id)
    // Still has mother→childB and both→childA.
    await repository.save(tree)

    const restored = await repository.load()
    expect(restored!.persons).toHaveLength(4)
    expect(restored!.partnerRelationships).toHaveLength(1)
    expect(
      restored!.parentChildRelationships.some(
        (r) => r.parentId === built.father.id && r.childId === built.childB.id,
      ),
    ).toBe(false)
    // Layout still hangs childB under couple via mother + visual spouse expansion.
    const graph = layoutFamilyTree(restored!, { centerId: built.father.id, mode: 'full' })
    expect(graph.visiblePersonIds.has(built.childB.id)).toBe(true)
    expect(graph.edges.some((e) => e.kind === 'junction-to-child' && e.target === built.childB.id)).toBe(true)
  })
})

describe('layout constants stay consistent with visual cards', () => {
  it('exports card metrics used by both layout and UI nodes', () => {
    expect(PERSON_NODE_WIDTH).toBe(178)
    expect(PERSON_NODE_HEIGHT).toBe(88)
    expect(NODE_GAP_X).toBeGreaterThan(PERSON_NODE_WIDTH)
  })
})
