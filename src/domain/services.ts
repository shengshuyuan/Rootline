import { nanoid } from 'nanoid'
import type { CreateParentChildInput, CreatePartnerInput, CreatePersonInput, DeletionImpact, FamilyTree, ParentRole, Person, UpdatePersonInput } from '../types'
import { CURRENT_SCHEMA_VERSION } from '../types'
import {
  createsAncestryCycle,
  FamilyTreeValidationError,
  isParentRole,
  partnerPairKey,
  validateFamilyTree,
  validateParentRoleMatchesGender,
  validatePersonDates,
  validateWritableGender,
} from '../validation'

const now = () => new Date().toISOString()
const clone = <T>(value: T): T => structuredClone(value)
const assertValid = (tree: FamilyTree) => {
  const issues = validateFamilyTree(tree)
  if (issues.length) throw new FamilyTreeValidationError(issues)
}
const touch = (tree: FamilyTree): FamilyTree => ({ ...tree, updatedAt: now() })

const roleForGender = (gender: Person['gender']): ParentRole => {
  if (gender === 'male') return 'father'
  if (gender === 'female') return 'mother'
  return 'unknown'
}

/** Partner of a person, if a single MVP spouse relationship exists. */
export function findPartnerId(tree: FamilyTree, personId: string): string | undefined {
  const relationship = tree.partnerRelationships.find(
    (candidate) => candidate.person1Id === personId || candidate.person2Id === personId,
  )
  if (!relationship) return undefined
  return relationship.person1Id === personId ? relationship.person2Id : relationship.person1Id
}

/**
 * Attach a child to a parent, and — when that parent has a recorded spouse —
 * also attach the spouse so the child belongs to the marital unit (家庭单元).
 */
export function attachChildToParentUnit(tree: FamilyTree, parentId: string, childId: string): FamilyTree {
  const parent = tree.persons.find((person) => person.id === parentId)
  if (!parent) throw new FamilyTreeValidationError(['未找到父母人物'])
  if (parent.gender === 'unknown') {
    throw new FamilyTreeValidationError(['请先为当前人物补充性别（男性/女性）后再添加子女'])
  }

  let next = tree
  const alreadyLinked = (candidateParentId: string) =>
    next.parentChildRelationships.some(
      (relationship) => relationship.parentId === candidateParentId && relationship.childId === childId,
    )

  if (!alreadyLinked(parentId)) {
    next = addParentChildRelationship(next, {
      parentId,
      childId,
      parentRole: roleForGender(parent.gender),
      relationshipType: 'biological',
    })
  }

  const spouseId = findPartnerId(next, parentId)
  if (!spouseId || alreadyLinked(spouseId)) return next

  const spouse = next.persons.find((person) => person.id === spouseId)
  if (!spouse || spouse.gender === 'unknown') return next

  return addParentChildRelationship(next, {
    parentId: spouseId,
    childId,
    parentRole: roleForGender(spouse.gender),
    relationshipType: 'biological',
  })
}

export function createEmptyFamilyTree(name: string, options: Pick<FamilyTree, 'surname' | 'description'> = {}): FamilyTree {
  const timestamp = now()
  return { id: nanoid(), name: name.trim(), ...options, persons: [], parentChildRelationships: [], partnerRelationships: [], schemaVersion: CURRENT_SCHEMA_VERSION, createdAt: timestamp, updatedAt: timestamp }
}

/** Update tree display metadata (name / surname / description). */
export function updateFamilyTreeMeta(
  tree: FamilyTree,
  input: Partial<Pick<FamilyTree, 'name' | 'surname' | 'description'>>,
): FamilyTree {
  const name = input.name === undefined ? tree.name : input.name.trim()
  if (!name) throw new FamilyTreeValidationError(['族谱名称不能为空'])
  return touch({
    ...clone(tree),
    name,
    surname: input.surname === undefined ? tree.surname : (input.surname.trim() || undefined),
    description: input.description === undefined ? tree.description : (input.description.trim() || undefined),
  })
}

export function addPerson(tree: FamilyTree, input: CreatePersonInput): FamilyTree {
  const person: Person = { ...clone(input), id: nanoid(), name: input.name.trim(), createdAt: now(), updatedAt: now() }
  const issues = !person.name ? ['姓名不能为空'] : [...validateWritableGender(person.gender), ...validatePersonDates(person)]
  if (issues.length) throw new FamilyTreeValidationError(issues)
  const next = touch({ ...clone(tree), persons: [...tree.persons, person] })
  assertValid(next)
  return next
}

export function updatePerson(tree: FamilyTree, personId: string, input: UpdatePersonInput): FamilyTree {
  const existing = tree.persons.find((person) => person.id === personId)
  if (!existing) throw new FamilyTreeValidationError(['未找到要更新的人物'])
  const person = { ...existing, ...clone(input), id: existing.id, name: input.name === undefined ? existing.name : input.name.trim(), updatedAt: now() }
  const issues = !person.name ? ['姓名不能为空'] : [...validateWritableGender(person.gender), ...validatePersonDates(person)]
  if (issues.length) throw new FamilyTreeValidationError(issues)
  const next = touch({ ...clone(tree), persons: tree.persons.map((candidate) => candidate.id === personId ? person : candidate) })
  assertValid(next)
  return next
}

export function getDeletionImpact(tree: FamilyTree, personId: string): DeletionImpact {
  const person = tree.persons.find((candidate) => candidate.id === personId)
  if (!person) throw new FamilyTreeValidationError(['未找到要删除的人物'])
  return { person: clone(person), parentChildRelationships: tree.parentChildRelationships.filter((r) => r.parentId === personId || r.childId === personId), partnerRelationships: tree.partnerRelationships.filter((r) => r.person1Id === personId || r.person2Id === personId) }
}

export function deletePerson(tree: FamilyTree, personId: string): FamilyTree {
  getDeletionImpact(tree, personId)
  const next = touch({ ...clone(tree), rootPersonId: tree.rootPersonId === personId ? undefined : tree.rootPersonId, persons: tree.persons.filter((person) => person.id !== personId), parentChildRelationships: tree.parentChildRelationships.filter((r) => r.parentId !== personId && r.childId !== personId), partnerRelationships: tree.partnerRelationships.filter((r) => r.person1Id !== personId && r.person2Id !== personId) })
  assertValid(next)
  return next
}

export function addParentChildRelationship(tree: FamilyTree, input: CreateParentChildInput): FamilyTree {
  if (!isParentRole(input.parentRole)) {
    throw new FamilyTreeValidationError(['亲子角色无效'])
  }
  const parent = tree.persons.find((person) => person.id === input.parentId)
  const child = tree.persons.find((person) => person.id === input.childId)
  if (!parent || !child) throw new FamilyTreeValidationError(['亲子关系引用了不存在的人物'])
  const roleIssues = validateParentRoleMatchesGender(parent, input.parentRole)
  if (roleIssues.length) throw new FamilyTreeValidationError(roleIssues)
  if (createsAncestryCycle(tree.parentChildRelationships, input.parentId, input.childId)) {
    throw new FamilyTreeValidationError(['该关系会形成祖先循环'])
  }
  const relationship = { ...clone(input), id: nanoid(), createdAt: now(), updatedAt: now() }
  const next = touch({ ...clone(tree), parentChildRelationships: [...tree.parentChildRelationships, relationship] })
  assertValid(next)
  return next
}

export function removeParentChildRelationship(tree: FamilyTree, relationshipId: string): FamilyTree {
  if (!tree.parentChildRelationships.some((relationship) => relationship.id === relationshipId)) throw new FamilyTreeValidationError(['未找到亲子关系'])
  return touch({ ...clone(tree), parentChildRelationships: tree.parentChildRelationships.filter((relationship) => relationship.id !== relationshipId) })
}

export function addPartnerRelationship(tree: FamilyTree, input: CreatePartnerInput): FamilyTree {
  if (input.person1Id === input.person2Id) throw new FamilyTreeValidationError(['人物不能与自己建立配偶关系'])
  const involved = new Set([input.person1Id, input.person2Id])
  if (tree.partnerRelationships.some((relationship) => involved.has(relationship.person1Id) || involved.has(relationship.person2Id))) throw new FamilyTreeValidationError(['MVP 中每人最多只能有一位配偶'])
  if (tree.partnerRelationships.some((relationship) => partnerPairKey(relationship) === partnerPairKey(input))) throw new FamilyTreeValidationError(['该配偶关系已存在'])
  const relationship = { ...clone(input), id: nanoid(), createdAt: now(), updatedAt: now() }
  const next = touch({ ...clone(tree), partnerRelationships: [...tree.partnerRelationships, relationship] })
  assertValid(next)
  return next
}

export function removePartnerRelationship(tree: FamilyTree, relationshipId: string): FamilyTree {
  if (!tree.partnerRelationships.some((relationship) => relationship.id === relationshipId)) throw new FamilyTreeValidationError(['未找到配偶关系'])
  return touch({ ...clone(tree), partnerRelationships: tree.partnerRelationships.filter((relationship) => relationship.id !== relationshipId) })
}

export function searchPersons(tree: FamilyTree, query: string): Person[] {
  const needle = query.trim().toLocaleLowerCase()
  if (!needle) return []
  return tree.persons.filter((person) => [person.name, ...(person.formerNames ?? []), person.generationName, person.rank, person.ancestralHome, person.occupation, person.biography, person.notes].filter(Boolean).some((field) => field!.toLocaleLowerCase().includes(needle)))
}
