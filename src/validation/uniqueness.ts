import type { FamilyTree, ParentChildRelationship, PartnerRelationship } from '../types'

const pairKey = (first: string, second: string) => [first, second].sort().join(':')
export const partnerPairKey = (relationship: Pick<PartnerRelationship, 'person1Id' | 'person2Id'>) => pairKey(relationship.person1Id, relationship.person2Id)
export const parentChildKey = (relationship: Pick<ParentChildRelationship, 'parentId' | 'childId'>) => `${relationship.parentId}:${relationship.childId}`

export function validateUniqueness(tree: FamilyTree): string[] {
  const issues: string[] = []
  const findDuplicates = (values: string[], label: string) => {
    const seen = new Set<string>()
    values.forEach((value) => { if (seen.has(value)) issues.push(`存在重复${label}：${value}`); seen.add(value) })
  }
  findDuplicates(tree.persons.map((person) => person.id), '人物 ID')
  findDuplicates(tree.parentChildRelationships.map((relationship) => relationship.id), '亲子关系 ID')
  findDuplicates(tree.partnerRelationships.map((relationship) => relationship.id), '配偶关系 ID')
  findDuplicates(tree.parentChildRelationships.map(parentChildKey), '亲子关系')
  findDuplicates(tree.partnerRelationships.map(partnerPairKey), '配偶关系')
  return issues
}

export function validateReferences(tree: FamilyTree): string[] {
  const ids = new Set(tree.persons.map((person) => person.id))
  const issues: string[] = []
  tree.parentChildRelationships.forEach((relationship) => {
    if (!ids.has(relationship.parentId) || !ids.has(relationship.childId)) issues.push(`亲子关系 ${relationship.id} 引用了不存在的人物`)
    if (relationship.parentId === relationship.childId) issues.push('人物不能与自己建立亲子关系')
  })
  tree.partnerRelationships.forEach((relationship) => {
    if (!ids.has(relationship.person1Id) || !ids.has(relationship.person2Id)) issues.push(`配偶关系 ${relationship.id} 引用了不存在的人物`)
    if (relationship.person1Id === relationship.person2Id) issues.push('人物不能与自己建立配偶关系')
  })
  if (tree.rootPersonId && !ids.has(tree.rootPersonId)) issues.push('根人物不存在')
  return issues
}

export function validateSingleSpouse(tree: FamilyTree): string[] {
  const partners = new Map<string, number>()
  tree.partnerRelationships.forEach(({ person1Id, person2Id }) => {
    partners.set(person1Id, (partners.get(person1Id) ?? 0) + 1)
    partners.set(person2Id, (partners.get(person2Id) ?? 0) + 1)
  })
  return [...partners.entries()].filter(([, count]) => count > 1).map(([personId]) => `人物 ${personId} 在 MVP 中最多只能有一位配偶`)
}
