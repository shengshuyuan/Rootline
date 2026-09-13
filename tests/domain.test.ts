import { describe, expect, it } from 'vitest'
import { addParentChildRelationship, addPartnerRelationship, addPerson, attachChildToParentUnit, createEmptyFamilyTree, deletePerson, getDeletionImpact, searchPersons, updatePerson } from '../src/domain'
import { fourGenerationTree } from '../src/fixtures'
import { importAndReplace, parseFamilyTreeJson, stringifyFamilyTree } from '../src/io'
import type { FamilyTree } from '../src/types'
import type { FamilyTreeRepository } from '../src/repository'
import { FamilyTreeValidationError, validateFamilyTree } from '../src/validation'

describe('family tree domain', () => {
  it('rejects a second spouse while retaining an extensible relationship model', () => {
    expect(() => addPartnerRelationship(fourGenerationTree, { person1Id: 'p9', person2Id: 'p11', relationshipType: 'married' })).toThrow('最多只能有一位配偶')
  })

  it('rejects ancestor cycles', () => {
    expect(() => addParentChildRelationship(fourGenerationTree, { parentId: 'p17', childId: 'p1', parentRole: 'father', relationshipType: 'biological' })).toThrow('祖先循环')
  })

  it('does not treat same-name people as duplicates', () => {
    expect(searchPersons(fourGenerationTree, '盛国安').map((person) => person.id)).toEqual(['p9', 'p11'])
  })

  it('reports relationship deletion impact and deletes all linked edges', () => {
    const impact = getDeletionImpact(fourGenerationTree, 'p9')
    expect(impact.parentChildRelationships).toHaveLength(4)
    expect(impact.partnerRelationships).toHaveLength(1)
    const result = deletePerson(fourGenerationTree, 'p9')
    expect(result.persons.some((person) => person.id === 'p9')).toBe(false)
    expect(result.parentChildRelationships.some((relationship) => relationship.parentId === 'p9' || relationship.childId === 'p9')).toBe(false)
  })

  it('validates chronological and living-person date constraints', () => {
    expect(() => addPerson(fourGenerationTree, { name: '错误日期', gender: 'unknown', isDeceased: false, birth: { value: '2000', precision: 'year' }, death: { value: '1999', precision: 'year' } })).toThrow('去世日期')
  })
})

describe('optional occupation', () => {
  it('persists occupation when provided and allows omitting it', () => {
    let tree = createEmptyFamilyTree('职业字段')
    tree = addPerson(tree, { name: '无职业', gender: 'male', isDeceased: false })
    expect(tree.persons[0].occupation).toBeUndefined()
    tree = addPerson(tree, { name: '有职业', gender: 'female', isDeceased: false, occupation: '教师' })
    expect(tree.persons[1].occupation).toBe('教师')
    tree = updatePerson(tree, tree.persons[1].id, { occupation: '校长' })
    expect(tree.persons[1].occupation).toBe('校长')
    tree = updatePerson(tree, tree.persons[1].id, { occupation: undefined })
    // Partial update with undefined overwrites via spread — empty string path clears in UI via trim||undefined
    expect(searchPersons(tree, '教师')).toHaveLength(0)
    tree = updatePerson(tree, tree.persons[1].id, { occupation: '经商' })
    expect(searchPersons(tree, '经商').map((p) => p.name)).toEqual(['有职业'])
  })
})

describe('personal biography', () => {
  it('persists biography separately from life experiences and makes both searchable', () => {
    let tree = createEmptyFamilyTree('个人简介字段')
    tree = addPerson(tree, {
      name: '盛远行',
      gender: 'male',
      isDeceased: false,
      occupation: '教师',
      biography: '温和耐心，擅长整理家族故事。',
      notes: '曾在衡阳任教，退休后主持族谱修订。',
    })

    expect(tree.persons[0].biography).toBe('温和耐心，擅长整理家族故事。')
    expect(tree.persons[0].notes).toBe('曾在衡阳任教，退休后主持族谱修订。')
    expect(searchPersons(tree, '家族故事').map((person) => person.name)).toEqual(['盛远行'])
    expect(searchPersons(tree, '族谱修订').map((person) => person.name)).toEqual(['盛远行'])

    tree = updatePerson(tree, tree.persons[0].id, { biography: undefined })
    expect(searchPersons(tree, '家族故事')).toHaveLength(0)
    expect(searchPersons(tree, '族谱修订')).toHaveLength(1)
  })
})

describe('attachChildToParentUnit', () => {
  it('links both spouses when adding a child to one parent of a couple', () => {
    let tree = createEmptyFamilyTree('夫妻单元')
    tree = addPerson(tree, { name: '盛义明', gender: 'male', isDeceased: false })
    tree = addPerson(tree, { name: '李开善', gender: 'female', isDeceased: true })
    tree = addPerson(tree, { name: '盛森林', gender: 'male', isDeceased: false })
    const [father, mother, child] = tree.persons
    tree = addPartnerRelationship(tree, {
      person1Id: father.id,
      person2Id: mother.id,
      relationshipType: 'married',
    })
    tree = attachChildToParentUnit(tree, mother.id, child.id)
    const parents = tree.parentChildRelationships.filter((relationship) => relationship.childId === child.id)
    expect(parents.map((relationship) => relationship.parentId).sort()).toEqual([father.id, mother.id].sort())
    expect(parents.map((relationship) => relationship.parentRole).sort()).toEqual(['father', 'mother'])
  })
})

describe('import and export', () => {
  it('round-trips valid JSON without changing the graph', () => {
    const imported = parseFamilyTreeJson(stringifyFamilyTree(fourGenerationTree))
    expect(imported).toEqual(fourGenerationTree)
  })

  it('accepts and exports personal biographies in JSON backups', () => {
    const tree: FamilyTree = {
      ...fourGenerationTree,
      persons: fourGenerationTree.persons.map((person) =>
        person.id === 'p9' ? { ...person, biography: '主线人物简介。' } : person,
      ),
    }
    const imported = parseFamilyTreeJson(stringifyFamilyTree(tree))
    expect(imported.persons.find((person) => person.id === 'p9')?.biography).toBe('主线人物简介。')
  })

  it('rejects invalid imports before a repository can replace existing data', () => {
    const invalid = { ...fourGenerationTree, partnerRelationships: [...fourGenerationTree.partnerRelationships, { ...fourGenerationTree.partnerRelationships[0], id: 'second-spouse', person2Id: 'p3' }] }
    expect(() => parseFamilyTreeJson(JSON.stringify(invalid))).toThrow(FamilyTreeValidationError)
    expect(validateFamilyTree(fourGenerationTree)).toEqual([])
  })

  it('does not replace existing stored data when import validation fails', async () => {
    class MemoryRepository implements FamilyTreeRepository {
      constructor(private current: FamilyTree | null) {}
      load = async () => this.current
      save = async (tree: FamilyTree) => { this.current = tree }
      replaceFromImport = async (tree: FamilyTree) => { this.current = tree }
      export = async () => this.current
    }
    const repository = new MemoryRepository(fourGenerationTree)
    await expect(importAndReplace(repository, '{not valid json')).rejects.toThrow('不是合法 JSON')
    expect(await repository.load()).toEqual(fourGenerationTree)
  })
})
