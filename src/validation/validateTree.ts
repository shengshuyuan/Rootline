import type { FamilyTree } from '../types'
import { validateNoAncestryCycles } from './cycle'
import { validatePartnerDates, validatePersonDates } from './dateRules'
import {
  validateParentChildEnums,
  validateParentRolesAgainstGenders,
  validatePartnerEnums,
  validatePersonEnums,
} from './enums'
import { validateReferences, validateSingleSpouse, validateUniqueness } from './uniqueness'

export function validateFamilyTree(tree: FamilyTree): string[] {
  const issues = [
    ...validateUniqueness(tree),
    ...validateReferences(tree),
    ...validateSingleSpouse(tree),
    ...validateNoAncestryCycles(tree.parentChildRelationships),
    ...validateParentRolesAgainstGenders(tree.persons, tree.parentChildRelationships),
  ]

  if (typeof tree.name !== 'string' || !tree.name.trim()) {
    issues.push('族谱名称不能为空')
  }

  tree.persons.forEach((person) => {
    issues.push(...validatePersonEnums(person))
    issues.push(...validatePersonDates(person).map((message) => `人物 ${person.id}：${message}`))
  })
  tree.parentChildRelationships.forEach((relationship) => {
    issues.push(...validateParentChildEnums(relationship))
  })
  tree.partnerRelationships.forEach((relationship) => {
    issues.push(...validatePartnerEnums(relationship))
    issues.push(...validatePartnerDates(relationship).map((message) => `配偶关系 ${relationship.id}：${message}`))
  })

  return issues
}
