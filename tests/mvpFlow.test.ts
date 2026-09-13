import { describe, expect, it } from 'vitest'
import {
  addParentChildRelationship,
  addPartnerRelationship,
  addPerson,
  attachChildToParentUnit,
  createEmptyFamilyTree,
  layoutFamilyTree,
  removeParentChildRelationship,
  updateFamilyTreeMeta,
  updatePerson,
} from '../src/domain'
import {
  importAndReplace,
  parseFamilyTreeJson,
  stringifyFamilyTree,
  summarizeFamilyTree,
} from '../src/io'
import type { FamilyTree } from '../src/types'
import type { FamilyTreeRepository } from '../src/repository'
import { FamilyTreeValidationError } from '../src/validation'
import { mapValidationIssues } from '../src/utils/formErrors'

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

/**
 * MVP browser-equivalent path (domain + repository, no UI):
 * create root → parents/spouse/two children → edit date → link existing →
 * unlink → export → reload → re-import.
 */
describe('MVP critical path', () => {
  it('runs create → relations → edit → link → unlink → export → refresh → re-import', async () => {
    const repository = new MemoryRepository()

    // 1) Create first person (empty device)
    let tree = createEmptyFamilyTree('盛氏家族族谱', { surname: '盛' })
    tree = addPerson(tree, { name: '盛义明', gender: 'male', isDeceased: false })
    const root = tree.persons[0]
    tree = { ...tree, rootPersonId: root.id }
    await repository.save(tree)

    // 2) Add spouse + two children via marital unit
    tree = addPerson(tree, { name: '李开善', gender: 'female', isDeceased: true })
    const spouse = tree.persons[1]
    tree = addPartnerRelationship(tree, {
      person1Id: root.id,
      person2Id: spouse.id,
      relationshipType: 'married',
    })
    tree = addPerson(tree, { name: '盛森林', gender: 'male', isDeceased: false })
    const childA = tree.persons[2]
    tree = attachChildToParentUnit(tree, root.id, childA.id)
    tree = addPerson(tree, { name: '盛香米', gender: 'male', isDeceased: false })
    const childB = tree.persons[3]
    tree = attachChildToParentUnit(tree, spouse.id, childB.id)

    // 3) Add a parent of root
    tree = addPerson(tree, { name: '盛祖父', gender: 'male', isDeceased: true })
    const grandpa = tree.persons[4]
    tree = addParentChildRelationship(tree, {
      parentId: grandpa.id,
      childId: root.id,
      parentRole: 'father',
      relationshipType: 'biological',
    })

    // 4) Edit birth date (solar)
    tree = updatePerson(tree, root.id, {
      birth: { value: '1918-08-21', precision: 'exact', calendar: 'solar' },
      ancestralHome: '广东潮州',
    })
    await repository.save(tree)

    // 5) Link existing: create outsider then link as child of childA (association path)
    tree = addPerson(tree, { name: '盛孙一', gender: 'male', isDeceased: false })
    const grand = tree.persons[5]
    tree = attachChildToParentUnit(tree, childA.id, grand.id)

    // 6) Unlink one parent-child edge (father→childB only); mother edge remains
    const fatherToB = tree.parentChildRelationships.find(
      (r) => r.parentId === root.id && r.childId === childB.id,
    )!
    tree = removeParentChildRelationship(tree, fatherToB.id)

    // 7) Unlink partner edge then re-add is out of scope; just remove a partner on a temp couple N/A
    // Remove grand link entirely as "解除关系"
    const grandEdge = tree.parentChildRelationships.find(
      (r) => r.parentId === childA.id && r.childId === grand.id,
    )!
    tree = removeParentChildRelationship(tree, grandEdge.id)
    await repository.save(tree)

    // Layout still valid: couple + children, no crash, dual parent for childA
    const layout = layoutFamilyTree(tree, { centerId: root.id, mode: 'full' })
    expect(layout.visiblePersonIds.has(childA.id)).toBe(true)
    expect(layout.visiblePersonIds.has(childB.id)).toBe(true)
    expect(layout.edges.filter((e) => e.kind === 'junction-to-child' && e.target === childA.id)).toHaveLength(1)

    // 8) Export JSON
    const exported = stringifyFamilyTree(tree)
    expect(exported).toContain('盛义明')
    expect(exported).toContain('广东潮州')

    // 9) Refresh restore
    const restored = await repository.load()
    expect(restored!.persons).toHaveLength(6)
    expect(restored!.persons.find((p) => p.id === root.id)?.birth?.value).toBe('1918-08-21')

    // 10) Re-import into a clean repository (replace)
    const clean = new MemoryRepository(createEmptyFamilyTree('旧数据', { surname: '旧' }))
    await clean.save(createEmptyFamilyTree('将被替换', { surname: 'X' }))
    const reimported = await importAndReplace(clean, exported)
    expect(reimported.name).toBe('盛氏家族族谱')
    expect(reimported.persons).toHaveLength(6)
    expect(await clean.load()).toEqual(reimported)

    // Summary for import preview
    const summary = summarizeFamilyTree(reimported)
    expect(summary.personCount).toBe(6)
    expect(summary.parentChildCount).toBeGreaterThan(0)
    expect(summary.partnerCount).toBe(1)
  })

  it('supports renaming the family tree before export', () => {
    let tree = createEmptyFamilyTree('临时名', { surname: '盛' })
    tree = updateFamilyTreeMeta(tree, { name: '盛氏家族总谱', surname: '盛' })
    expect(tree.name).toBe('盛氏家族总谱')
    expect(() => updateFamilyTreeMeta(tree, { name: '   ' })).toThrow(FamilyTreeValidationError)
  })

  it('rejects second spouse and cycles with messages mappable to forms', () => {
    let tree = createEmptyFamilyTree('规则')
    tree = addPerson(tree, { name: '甲', gender: 'male', isDeceased: false })
    tree = addPerson(tree, { name: '乙', gender: 'female', isDeceased: false })
    tree = addPerson(tree, { name: '丙', gender: 'female', isDeceased: false })
    tree = addPerson(tree, { name: '丁', gender: 'male', isDeceased: false })
    const [a, b, c, d] = tree.persons
    tree = addPartnerRelationship(tree, { person1Id: a.id, person2Id: b.id, relationshipType: 'married' })
    expect(() =>
      addPartnerRelationship(tree, { person1Id: a.id, person2Id: c.id, relationshipType: 'married' }),
    ).toThrow(/配偶/)

    // Cycle: a → d → a, both male so parentRole father is gender-valid.
    tree = addParentChildRelationship(tree, {
      parentId: a.id,
      childId: d.id,
      parentRole: 'father',
      relationshipType: 'biological',
    })
    expect(() =>
      addParentChildRelationship(tree, {
        parentId: d.id,
        childId: a.id,
        parentRole: 'father',
        relationshipType: 'biological',
      }),
    ).toThrow(/循环/)

    const spouseIssues = mapValidationIssues(['MVP 中每人最多只能有一位配偶'])
    expect(spouseIssues.form.some((m) => m.includes('配偶'))).toBe(true)
    const cycleIssues = mapValidationIssues(['该关系会形成祖先循环'])
    expect(cycleIssues.form.some((m) => m.includes('循环'))).toBe(true)
  })

  it('import preview parse fails without replacing repository data', async () => {
    const base = createEmptyFamilyTree('保留')
    const withPerson = addPerson(base, { name: '原有人', gender: 'male', isDeceased: false })
    const repository = new MemoryRepository(withPerson)
    await expect(importAndReplace(repository, '{not-json')).rejects.toThrow(/JSON/)
    expect(await repository.load()).toEqual(withPerson)
    expect(() => parseFamilyTreeJson(stringifyFamilyTree(withPerson))).not.toThrow()
  })
})
