import { describe, expect, it } from 'vitest'
import { layoutFamilyTree, searchPersons } from '../src/domain'
import type { FamilyTree, ParentChildRelationship, Person } from '../src/types'

const stamp = '2026-07-17T00:00:00.000Z'

function largeFamilyTree(size: number): FamilyTree {
  const persons: Person[] = Array.from({ length: size }, (_, index) => ({
    id: `person-${index}`,
    name: `成员${index}`,
    gender: 'male',
    isDeceased: false,
    occupation: index === size - 1 ? '性能验收目标' : undefined,
    createdAt: stamp,
    updatedAt: stamp,
  }))
  const parentChildRelationships: ParentChildRelationship[] = Array.from(
    { length: Math.max(0, size - 1) },
    (_, index) => ({
      id: `edge-${index}`,
      parentId: `person-${index}`,
      childId: `person-${index + 1}`,
      parentRole: 'father',
      relationshipType: 'biological',
      createdAt: stamp,
      updatedAt: stamp,
    }),
  )
  return {
    id: `scale-${size}`,
    name: `${size}人性能族谱`,
    rootPersonId: 'person-0',
    persons,
    parentChildRelationships,
    partnerRelationships: [],
    schemaVersion: '1.0.0',
    createdAt: stamp,
    updatedAt: stamp,
  }
}

describe('100/500 person performance budgets', () => {
  for (const size of [100, 500]) {
    it(`lays out and searches ${size} people within the MVP budget`, () => {
      const tree = largeFamilyTree(size)
      const layoutStarted = performance.now()
      const graph = layoutFamilyTree(tree, { centerId: 'person-0', mode: 'full' })
      const layoutMs = performance.now() - layoutStarted

      const searchStarted = performance.now()
      const results = searchPersons(tree, '性能验收目标')
      const searchMs = performance.now() - searchStarted

      expect(graph.visiblePersonIds.size).toBe(size)
      expect(results.map((person) => person.id)).toEqual([`person-${size - 1}`])
      expect(layoutMs).toBeLessThan(1_000)
      expect(searchMs).toBeLessThan(300)
    })
  }
})
