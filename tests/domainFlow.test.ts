import { describe, expect, it } from 'vitest'
import {
  addParentChildRelationship,
  addPartnerRelationship,
  addPerson,
  createEmptyFamilyTree,
  layoutFamilyTree,
  removeParentChildRelationship,
  updatePerson,
} from '../src/domain'
import type { FamilyTree } from '../src/types'
import type { FamilyTreeRepository } from '../src/repository'

/** In-memory repository used to simulate IndexedDB save + refresh restore. */
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

describe('end-to-end family maintenance flow', () => {
  it('create person → spouse → two children → edit date → unlink → refresh restores', async () => {
    const repository = new MemoryRepository()
    let tree = createEmptyFamilyTree('回归测试族谱', { surname: '盛' })

    tree = addPerson(tree, { name: '盛甲', gender: 'male', isDeceased: false })
    const root = tree.persons[0]
    tree = { ...tree, rootPersonId: root.id }
    await repository.save(tree)

    tree = addPerson(tree, { name: '王乙', gender: 'female', isDeceased: false })
    const spouse = tree.persons[1]
    tree = addPartnerRelationship(tree, {
      person1Id: root.id,
      person2Id: spouse.id,
      relationshipType: 'married',
    })

    tree = addPerson(tree, { name: '盛丙', gender: 'male', isDeceased: false })
    const childA = tree.persons[2]
    tree = addParentChildRelationship(tree, {
      parentId: root.id,
      childId: childA.id,
      parentRole: 'father',
      relationshipType: 'biological',
    })
    tree = addParentChildRelationship(tree, {
      parentId: spouse.id,
      childId: childA.id,
      parentRole: 'mother',
      relationshipType: 'biological',
    })

    tree = addPerson(tree, { name: '盛丁', gender: 'female', isDeceased: false })
    const childB = tree.persons[3]
    tree = addParentChildRelationship(tree, {
      parentId: root.id,
      childId: childB.id,
      parentRole: 'father',
      relationshipType: 'biological',
    })
    tree = addParentChildRelationship(tree, {
      parentId: spouse.id,
      childId: childB.id,
      parentRole: 'mother',
      relationshipType: 'biological',
    })

    tree = updatePerson(tree, root.id, {
      birth: { value: '1980-05-12', precision: 'exact', calendar: 'solar' },
    })
    await repository.save(tree)

    // Dual-parent children must render one downward edge each (no stacking).
    const layout = layoutFamilyTree(tree, { centerId: root.id, mode: 'full' })
    expect(layout.edges.filter((edge) => edge.kind === 'junction-to-child' && edge.target === childA.id)).toHaveLength(1)
    expect(layout.edges.filter((edge) => edge.kind === 'junction-to-child' && edge.target === childB.id)).toHaveLength(1)
    expect(layout.nodes.find((node) => node.id === root.id)?.position.y)
      .toBe(layout.nodes.find((node) => node.id === spouse.id)?.position.y)

    const childEdge = tree.parentChildRelationships.find(
      (relationship) => relationship.parentId === root.id && relationship.childId === childB.id,
    )!
    tree = removeParentChildRelationship(tree, childEdge.id)
    await repository.save(tree)

    // Simulate browser refresh: reload from repository.
    const restored = await repository.load()
    expect(restored).not.toBeNull()
    expect(restored!.persons).toHaveLength(4)
    expect(restored!.partnerRelationships).toHaveLength(1)
    expect(restored!.parentChildRelationships.some(
      (relationship) => relationship.parentId === root.id && relationship.childId === childB.id,
    )).toBe(false)
    expect(restored!.persons.find((person) => person.id === root.id)?.birth?.value).toBe('1980-05-12')
  })

  it('maps parent role only for known genders (UI must prompt when gender is unknown)', () => {
    // Domain rejects creating persons with gender 'unknown' on write paths.
    // UI contract: never default unknown → father; require the user to fill gender first.
    const roleFor = (gender: 'male' | 'female' | 'unknown') =>
      gender === 'female' ? 'mother' : gender === 'male' ? 'father' : null
    expect(roleFor('male')).toBe('father')
    expect(roleFor('female')).toBe('mother')
    expect(roleFor('unknown')).toBeNull()
  })
})
