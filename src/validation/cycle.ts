import type { ParentChildRelationship } from '../types'

export function createsAncestryCycle(relationships: ParentChildRelationship[], parentId: string, childId: string): boolean {
  if (parentId === childId) return true
  const childrenByParent = new Map<string, string[]>()
  relationships.forEach((relationship) => {
    const children = childrenByParent.get(relationship.parentId) ?? []
    children.push(relationship.childId)
    childrenByParent.set(relationship.parentId, children)
  })
  const stack = [childId]
  const visited = new Set<string>()
  while (stack.length) {
    const current = stack.pop()!
    if (current === parentId) return true
    if (visited.has(current)) continue
    visited.add(current)
    stack.push(...(childrenByParent.get(current) ?? []))
  }
  return false
}

export function validateNoAncestryCycles(relationships: ParentChildRelationship[]): string[] {
  const accepted: ParentChildRelationship[] = []
  const issues: string[] = []
  relationships.forEach((relationship) => {
    if (createsAncestryCycle(accepted, relationship.parentId, relationship.childId)) issues.push(`亲子关系 ${relationship.id} 会形成祖先循环`)
    else accepted.push(relationship)
  })
  return issues
}
