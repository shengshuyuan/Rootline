import type { FamilyTree } from '../types'

/**
 * Return the currently-collapsed people whose family branches contain targetPersonId.
 *
 * Collapsing either partner hides the descendants of their shared family unit, so
 * reverse traversal includes both a recorded parent and that parent's partner.
 */
export function findCollapsingAncestors(
  tree: FamilyTree,
  targetPersonId: string,
  collapsed: ReadonlySet<string>,
): Set<string> {
  if (!tree.persons.some((person) => person.id === targetPersonId)) return new Set()

  const parentsByChild = new Map<string, string[]>()
  tree.parentChildRelationships.forEach(({ parentId, childId }) => {
    parentsByChild.set(childId, [...(parentsByChild.get(childId) ?? []), parentId])
  })

  const partnerByPerson = new Map<string, string>()
  tree.partnerRelationships.forEach(({ person1Id, person2Id }) => {
    partnerByPerson.set(person1Id, person2Id)
    partnerByPerson.set(person2Id, person1Id)
  })

  const ancestors = new Set<string>()
  const visited = new Set<string>([targetPersonId])
  const queue = [targetPersonId]

  while (queue.length) {
    const currentId = queue.shift()!
    for (const parentId of parentsByChild.get(currentId) ?? []) {
      const familyUnit = [parentId, partnerByPerson.get(parentId)].filter(
        (id): id is string => Boolean(id),
      )
      for (const ancestorId of familyUnit) {
        ancestors.add(ancestorId)
        if (visited.has(ancestorId)) continue
        visited.add(ancestorId)
        queue.push(ancestorId)
      }
    }
  }

  return new Set([...collapsed].filter((personId) => ancestors.has(personId)))
}

/**
 * Build the collapse state needed to reveal a searched person while preserving
 * collapsed branches that cannot hide that person.
 */
export function expandCollapsedPathToPerson(
  tree: FamilyTree,
  targetPersonId: string,
  collapsed: ReadonlySet<string>,
): Set<string> {
  const blockers = findCollapsingAncestors(tree, targetPersonId, collapsed)
  if (!blockers.size) return new Set(collapsed)
  return new Set([...collapsed].filter((personId) => !blockers.has(personId)))
}
