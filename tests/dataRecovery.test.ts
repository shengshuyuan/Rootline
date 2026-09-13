import { describe, expect, it } from 'vitest'
import { fourGenerationTree } from '../src/fixtures'
import {
  importAndReplace,
  migrateFamilyTreeData,
  parseFamilyTreeJson,
  stringifyFamilyTree,
  type FamilyTreeMigration,
} from '../src/io'
import {
  MAX_RECOVERY_POINTS,
  recoveryPointIdsToPrune,
  type FamilyTreeRepository,
} from '../src/repository'
import {
  CURRENT_SCHEMA_VERSION,
  FAMILY_TREE_EXPORT_FORMAT,
  type FamilyTree,
  type RecoveryPointReason,
} from '../src/types'

class RecoveryAwareMemoryRepository implements FamilyTreeRepository {
  current: FamilyTree | null
  recoveryReasons: RecoveryPointReason[] = []
  replaceCalls = 0

  constructor(current: FamilyTree | null) {
    this.current = current ? structuredClone(current) : null
  }

  load = async () => this.current ? structuredClone(this.current) : null
  save = async (tree: FamilyTree) => { this.current = structuredClone(tree) }
  export = async () => this.load()
  createRecoveryPoint = async (reason: RecoveryPointReason = 'manual') => {
    this.recoveryReasons.push(reason)
    return null
  }
  replaceFromImport = async (tree: FamilyTree) => {
    this.replaceCalls += 1
    this.current = structuredClone(tree)
  }
}

describe('versioned JSON backup envelope', () => {
  it('exports metadata and a validated tree, then round-trips it', () => {
    const json = stringifyFamilyTree(fourGenerationTree)
    const envelope = JSON.parse(json) as Record<string, unknown>

    expect(envelope.format).toBe(FAMILY_TREE_EXPORT_FORMAT)
    expect(envelope.schemaVersion).toBe(CURRENT_SCHEMA_VERSION)
    expect(envelope.exportedAt).toEqual(expect.any(String))
    expect(envelope.tree).toEqual(fourGenerationTree)
    expect(parseFamilyTreeJson(json)).toEqual(fourGenerationTree)
  })

  it('continues accepting the previous naked FamilyTree JSON format', () => {
    expect(parseFamilyTreeJson(JSON.stringify(fourGenerationTree))).toEqual(fourGenerationTree)
  })

  it('rejects an envelope whose declared version disagrees with its tree', () => {
    const envelope = JSON.parse(stringifyFamilyTree(fourGenerationTree)) as Record<string, unknown>
    envelope.schemaVersion = '0.9.0'
    expect(() => parseFamilyTreeJson(JSON.stringify(envelope))).toThrow(/不一致/)
  })
})

describe('schema migration chain', () => {
  it('migrates a naked 0.9.0 tree with omitted optional fields to 1.0.0', () => {
    const legacy = structuredClone(fourGenerationTree) as unknown as Record<string, unknown>
    legacy.schemaVersion = '0.9.0'
    delete legacy.surname
    delete legacy.description
    const people = legacy.persons as Array<Record<string, unknown>>
    people.forEach((person) => {
      delete person.formerNames
      delete person.occupation
      delete person.notes
    })

    const migrated = parseFamilyTreeJson(JSON.stringify(legacy))
    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION)
    expect(migrated.persons).toHaveLength(fourGenerationTree.persons.length)
    expect(migrated.surname).toBeUndefined()
  })

  it('supports a caller-supplied multi-step migration registry', () => {
    const registry: FamilyTreeMigration[] = [
      {
        fromVersion: '1',
        toVersion: '2',
        migrate: (data) => ({ ...data, schemaVersion: '2', marker: 'first' }),
      },
      {
        fromVersion: '2',
        toVersion: '3',
        migrate: (data) => ({ ...data, schemaVersion: '3', marker: `${String(data.marker)}-second` }),
      },
    ]

    const result = migrateFamilyTreeData({ schemaVersion: '1' }, registry, '3')
    expect(result.appliedVersions).toEqual(['2', '3'])
    expect(result.data).toMatchObject({ schemaVersion: '3', marker: 'first-second' })
  })

  it('rejects versions without a complete registered path', () => {
    const unsupported = { ...fourGenerationTree, schemaVersion: '0.8.0' }
    expect(() => parseFamilyTreeJson(JSON.stringify(unsupported))).toThrow(/不支持的数据版本：0.8.0/)
  })
})

describe('recovery integration contract', () => {
  it('creates a recovery point after full validation and before import replacement', async () => {
    const repository = new RecoveryAwareMemoryRepository(fourGenerationTree)
    await importAndReplace(repository, stringifyFamilyTree({ ...fourGenerationTree, name: '导入版本' }))

    expect(repository.recoveryReasons).toEqual(['before-import'])
    expect(repository.replaceCalls).toBe(1)
    expect(repository.current?.name).toBe('导入版本')
  })

  it('does not snapshot or replace when import validation fails', async () => {
    const repository = new RecoveryAwareMemoryRepository(fourGenerationTree)
    await expect(importAndReplace(repository, '{broken')).rejects.toThrow(/不是合法 JSON/)
    expect(repository.recoveryReasons).toEqual([])
    expect(repository.replaceCalls).toBe(0)
  })

  it('prunes oldest recovery points and retains the newest 20', () => {
    const points = Array.from({ length: MAX_RECOVERY_POINTS + 5 }, (_, index) => ({
      id: `point-${String(index).padStart(2, '0')}`,
      createdAt: new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString(),
    }))
    expect(recoveryPointIdsToPrune(points)).toEqual(points.slice(0, 5).map((point) => point.id))
  })
})
