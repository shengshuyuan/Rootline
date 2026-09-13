import type { FamilyTree, ParentChildRelationship, PartnerRelationship, Person } from '../types'

export interface FamilyIndexes {
  personById: Map<string, Person>
  parentsByChild: Map<string, ParentChildRelationship[]>
  childrenByParent: Map<string, ParentChildRelationship[]>
  spouseByPerson: Map<string, string>
  partnerRelationshipByPerson: Map<string, PartnerRelationship>
}

function append<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const values = map.get(key)
  if (values) values.push(value)
  else map.set(key, [value])
}

/** Build the hot-path relationship indexes once per tree revision. */
export function createFamilyIndexes(tree: FamilyTree): FamilyIndexes {
  const personById = new Map(tree.persons.map((person) => [person.id, person]))
  const parentsByChild = new Map<string, ParentChildRelationship[]>()
  const childrenByParent = new Map<string, ParentChildRelationship[]>()
  const spouseByPerson = new Map<string, string>()
  const partnerRelationshipByPerson = new Map<string, PartnerRelationship>()

  tree.parentChildRelationships.forEach((relationship) => {
    append(parentsByChild, relationship.childId, relationship)
    append(childrenByParent, relationship.parentId, relationship)
  })
  tree.partnerRelationships.forEach((relationship) => {
    spouseByPerson.set(relationship.person1Id, relationship.person2Id)
    spouseByPerson.set(relationship.person2Id, relationship.person1Id)
    partnerRelationshipByPerson.set(relationship.person1Id, relationship)
    partnerRelationshipByPerson.set(relationship.person2Id, relationship)
  })

  return { personById, parentsByChild, childrenByParent, spouseByPerson, partnerRelationshipByPerson }
}
