import { describe, expect, it } from 'vitest'
import {
  addParentChildRelationship,
  addPerson,
  createEmptyFamilyTree,
  updatePerson,
} from '../src/domain'
import { importAndReplace, MAX_IMPORT_BYTES, parseFamilyTreeJson, stringifyFamilyTree } from '../src/io'
import { fourGenerationTree } from '../src/fixtures'
import type { FamilyTree } from '../src/types'
import type { FamilyTreeRepository } from '../src/repository'
import { FamilyTreeValidationError, validateFamilyTree } from '../src/validation'
import { candidatesForRelation } from '../src/components/forms/LinkDialog'

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

describe('import enum strictness (P0)', () => {
  it('rejects bogus gender and does not replace repository data', async () => {
    const good = fourGenerationTree
    const repository = new MemoryRepository(good)
    const bad = {
      ...good,
      persons: good.persons.map((person, index) =>
        index === 0 ? { ...person, gender: 'bogus' } : person,
      ),
    }
    await expect(importAndReplace(repository, JSON.stringify(bad))).rejects.toThrow(FamilyTreeValidationError)
    await expect(importAndReplace(repository, JSON.stringify(bad))).rejects.toThrow(/gender/)
    expect(await repository.load()).toEqual(good)
  })

  it('rejects illegal parentRole and date precision on import', () => {
    const base = stringifyFamilyTree(fourGenerationTree)
    const tree = parseFamilyTreeJson(base)
    tree.parentChildRelationships[0] = {
      ...tree.parentChildRelationships[0],
      parentRole: 'dad' as 'father',
    }
    expect(() => parseFamilyTreeJson(JSON.stringify(tree))).toThrow(/parentRole/)

    const tree2 = parseFamilyTreeJson(base)
    tree2.persons[0] = {
      ...tree2.persons[0],
      birth: { value: '1900-01-01', precision: 'exactish' as 'exact', calendar: 'solar' },
    }
    expect(() => parseFamilyTreeJson(JSON.stringify(tree2))).toThrow(/precision|精度/)
  })

  it('rejects empty person names on import', () => {
    const tree = parseFamilyTreeJson(stringifyFamilyTree(fourGenerationTree))
    tree.persons[0] = { ...tree.persons[0], name: '   ' }
    expect(() => parseFamilyTreeJson(JSON.stringify(tree))).toThrow(/姓名/)
  })

  it('rejects malformed optional values before they can crash the search view', () => {
    const tree = parseFamilyTreeJson(stringifyFamilyTree(fourGenerationTree))
    tree.persons[0] = { ...tree.persons[0], formerNames: {} as string[] }
    expect(() => parseFamilyTreeJson(JSON.stringify(tree))).toThrow(/formerNames.*字符串数组/)
  })

  it('rejects oversized pasted JSON before parsing it', () => {
    const oversized = `${JSON.stringify(fourGenerationTree)}${' '.repeat(MAX_IMPORT_BYTES)}`
    expect(() => parseFamilyTreeJson(oversized)).toThrow(/不能超过 5 MB/)
  })

  it('still accepts the valid fixture round-trip', () => {
    const json = stringifyFamilyTree(fourGenerationTree)
    expect(parseFamilyTreeJson(json)).toEqual(fourGenerationTree)
    expect(validateFamilyTree(fourGenerationTree)).toEqual([])
  })
})

describe('parent role vs gender (P1)', () => {
  it('domain rejects female as father and male as mother', () => {
    let tree = createEmptyFamilyTree('性别角色')
    tree = addPerson(tree, { name: '男甲', gender: 'male', isDeceased: false })
    tree = addPerson(tree, { name: '女乙', gender: 'female', isDeceased: false })
    tree = addPerson(tree, { name: '子丙', gender: 'male', isDeceased: false })
    const [man, woman, child] = tree.persons

    expect(() =>
      addParentChildRelationship(tree, {
        parentId: woman.id,
        childId: child.id,
        parentRole: 'father',
        relationshipType: 'biological',
      }),
    ).toThrow(/不是男性|父亲/)

    expect(() =>
      addParentChildRelationship(tree, {
        parentId: man.id,
        childId: child.id,
        parentRole: 'mother',
        relationshipType: 'biological',
      }),
    ).toThrow(/不是女性|母亲/)

    // Valid roles succeed
    tree = addParentChildRelationship(tree, {
      parentId: man.id,
      childId: child.id,
      parentRole: 'father',
      relationshipType: 'biological',
    })
    tree = addParentChildRelationship(tree, {
      parentId: woman.id,
      childId: child.id,
      parentRole: 'mother',
      relationshipType: 'biological',
    })
    expect(validateFamilyTree(tree)).toEqual([])
  })

  it('rejects creating a new father relationship when the new person is female', () => {
    // Simulates: openCreate('father') but user flips gender to female then saves.
    let tree = createEmptyFamilyTree('新建父亲')
    tree = addPerson(tree, { name: '孩子', gender: 'male', isDeceased: false })
    const child = tree.persons[0]
    tree = addPerson(tree, { name: '错标父亲', gender: 'female', isDeceased: false })
    const wrong = tree.persons[1]
    expect(() =>
      addParentChildRelationship(tree, {
        parentId: wrong.id,
        childId: child.id,
        parentRole: 'father',
        relationshipType: 'biological',
      }),
    ).toThrow(/父亲/)
  })

  it('LinkDialog candidates filter father/mother/spouse by gender', () => {
    let tree = createEmptyFamilyTree('候选')
    tree = addPerson(tree, { name: '本人男', gender: 'male', isDeceased: false })
    tree = addPerson(tree, { name: '男A', gender: 'male', isDeceased: false })
    tree = addPerson(tree, { name: '女B', gender: 'female', isDeceased: false })
    // Writable API rejects gender unknown; inject for filter coverage only.
    const stamp = tree.createdAt
    tree = {
      ...tree,
      persons: [
        ...tree.persons,
        {
          id: 'unknown-g',
          name: '未录',
          gender: 'unknown',
          isDeceased: false,
          createdAt: stamp,
          updatedAt: stamp,
        },
      ],
    }
    const self = tree.persons[0]

    const fathers = candidatesForRelation(tree, self.id, 'father').map((p) => p.name)
    expect(fathers).toEqual(['男A'])
    expect(fathers).not.toContain('女B')

    const mothers = candidatesForRelation(tree, self.id, 'mother').map((p) => p.name)
    expect(mothers).toEqual(['女B'])
    expect(mothers).not.toContain('男A')

    const spouses = candidatesForRelation(tree, self.id, 'spouse').map((p) => p.name)
    expect(spouses).toContain('女B')
    expect(spouses).not.toContain('男A')
    expect(spouses).toContain('未录')
  })

  it('validateFamilyTree flags existing father/mother gender conflicts', () => {
    let tree = createEmptyFamilyTree('存量冲突')
    tree = addPerson(tree, { name: '女', gender: 'female', isDeceased: false })
    tree = addPerson(tree, { name: '子', gender: 'male', isDeceased: false })
    // Bypass domain guard by constructing an illegal edge then validating.
    const illegal: FamilyTree = {
      ...tree,
      parentChildRelationships: [{
        id: 'bad',
        parentId: tree.persons[0].id,
        childId: tree.persons[1].id,
        parentRole: 'father',
        relationshipType: 'biological',
        createdAt: tree.createdAt,
        updatedAt: tree.updatedAt,
      }],
    }
    const issues = validateFamilyTree(illegal)
    expect(issues.some((issue) => /父亲|男性/.test(issue))).toBe(true)
  })

  it('changing parent gender to conflict with role fails on tree validation path', () => {
    let tree = createEmptyFamilyTree('改性别')
    tree = addPerson(tree, { name: '父', gender: 'male', isDeceased: false })
    tree = addPerson(tree, { name: '子', gender: 'male', isDeceased: false })
    tree = addParentChildRelationship(tree, {
      parentId: tree.persons[0].id,
      childId: tree.persons[1].id,
      parentRole: 'father',
      relationshipType: 'biological',
    })
    expect(() => updatePerson(tree, tree.persons[0].id, { gender: 'female' })).toThrow()
  })
})
