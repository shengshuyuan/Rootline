import { describe, expect, it } from 'vitest'
import { fourGenerationTree } from '../src/fixtures'
import { importAndReplace, stringifyFamilyTree } from '../src/io'
import {
  assertFreshStorageRevision,
  StorageConflictError,
  type FamilyTreeRepository,
} from '../src/repository'
import type { FamilyTree, RecoveryPoint, RecoveryPointReason } from '../src/types'

interface MemoryStore {
  current: FamilyTree | null
  revision: number | null
  recoveryPoints: RecoveryPoint[]
  failAtomicImportAfterStagingBackup: boolean
}

class VersionedMemoryRepository implements FamilyTreeRepository {
  private observedRevision: number | null = null

  constructor(private readonly store: MemoryStore) {}

  async load(): Promise<FamilyTree | null> {
    this.observedRevision = this.store.revision
    return this.store.current ? structuredClone(this.store.current) : null
  }

  async save(tree: FamilyTree): Promise<void> {
    assertFreshStorageRevision(this.observedRevision, this.store.revision)
    this.store.current = structuredClone(tree)
    this.store.revision = (this.store.revision ?? 0) + 1
    this.observedRevision = this.store.revision
  }

  async replaceFromImport(tree: FamilyTree): Promise<void> {
    return this.save(tree)
  }

  async replaceFromImportWithRecovery(
    tree: FamilyTree,
    reason: RecoveryPointReason = 'before-import',
  ): Promise<void> {
    assertFreshStorageRevision(this.observedRevision, this.store.revision)
    const stagedCurrent = structuredClone(tree)
    const stagedRevision = (this.store.revision ?? 0) + 1
    const stagedRecoveryPoints = [...this.store.recoveryPoints]
    if (this.store.current) {
      stagedRecoveryPoints.push({
        id: `point-${stagedRecoveryPoints.length + 1}`,
        createdAt: new Date(Date.UTC(2026, 0, stagedRecoveryPoints.length + 1)).toISOString(),
        reason,
        treeName: this.store.current.name,
        schemaVersion: this.store.current.schemaVersion,
      })
    }
    if (this.store.failAtomicImportAfterStagingBackup) throw new Error('simulated transaction failure')
    this.store.current = stagedCurrent
    this.store.revision = stagedRevision
    this.store.recoveryPoints = stagedRecoveryPoints
    this.observedRevision = stagedRevision
  }

  async export(): Promise<FamilyTree | null> {
    return this.load()
  }

  async createRecoveryPoint(reason: RecoveryPointReason = 'manual'): Promise<RecoveryPoint | null> {
    assertFreshStorageRevision(this.observedRevision, this.store.revision)
    if (!this.store.current) return null
    const point = {
      id: `point-${this.store.recoveryPoints.length + 1}`,
      createdAt: new Date(Date.UTC(2026, 0, this.store.recoveryPoints.length + 1)).toISOString(),
      reason,
      treeName: this.store.current.name,
      schemaVersion: this.store.current.schemaVersion,
    }
    this.store.recoveryPoints.push(point)
    return structuredClone(point)
  }

  async listRecoveryPoints(): Promise<RecoveryPoint[]> {
    return structuredClone(this.store.recoveryPoints)
  }
}

const createStore = (tree: FamilyTree | null): MemoryStore => ({
  current: tree ? structuredClone(tree) : null,
  revision: tree ? 0 : null,
  recoveryPoints: [],
  failAtomicImportAfterStagingBackup: false,
})

describe('storage revision concurrency contract', () => {
  it('rejects stale saves from another repository instance', async () => {
    const store = createStore(fourGenerationTree)
    const firstTab = new VersionedMemoryRepository(store)
    const secondTab = new VersionedMemoryRepository(store)
    const firstTree = await firstTab.load()
    const secondTree = await secondTab.load()
    if (!firstTree || !secondTree) throw new Error('fixture was not loaded')

    await firstTab.save({ ...firstTree, name: '第一窗口版本' })

    await expect(secondTab.save({ ...secondTree, name: '第二窗口旧版本' })).rejects.toThrow(StorageConflictError)
    expect(store.current?.name).toBe('第一窗口版本')
  })

  it('lets a stale writer resolve conflict by reloading the latest revision', async () => {
    const store = createStore(fourGenerationTree)
    const firstTab = new VersionedMemoryRepository(store)
    const secondTab = new VersionedMemoryRepository(store)
    const firstTree = await firstTab.load()
    await secondTab.load()
    if (!firstTree) throw new Error('fixture was not loaded')

    await firstTab.save({ ...firstTree, name: '已保存版本' })
    const reloaded = await secondTab.load()
    if (!reloaded) throw new Error('latest tree was not loaded')
    await secondTab.save({ ...reloaded, description: '重新载入后保存' })

    expect(store.current).toMatchObject({ name: '已保存版本', description: '重新载入后保存' })
    expect(store.revision).toBe(2)
  })

  it('rejects stale recovery points so failed deletes do not pollute history', async () => {
    const store = createStore(fourGenerationTree)
    const firstTab = new VersionedMemoryRepository(store)
    const secondTab = new VersionedMemoryRepository(store)
    const firstTree = await firstTab.load()
    await secondTab.load()
    if (!firstTree) throw new Error('fixture was not loaded')

    await firstTab.save({ ...firstTree, name: '删除前其他窗口已保存' })

    await expect(secondTab.createRecoveryPoint('before-delete')).rejects.toThrow(StorageConflictError)
    expect(store.recoveryPoints).toEqual([])
  })
})

describe('atomic import recovery contract', () => {
  it('rolls back the recovery point when replacement fails in the same transaction', async () => {
    const store = createStore(fourGenerationTree)
    const repository = new VersionedMemoryRepository(store)
    await repository.load()
    store.failAtomicImportAfterStagingBackup = true

    await expect(
      importAndReplace(repository, stringifyFamilyTree({ ...fourGenerationTree, name: '导入失败版本' })),
    ).rejects.toThrow('simulated transaction failure')

    expect(store.current?.name).toBe(fourGenerationTree.name)
    expect(store.revision).toBe(0)
    expect(await repository.listRecoveryPoints()).toEqual([])
  })

  it('creates exactly one recovery point and replaces the tree on successful atomic import', async () => {
    const store = createStore(fourGenerationTree)
    const repository = new VersionedMemoryRepository(store)
    await repository.load()

    await importAndReplace(repository, stringifyFamilyTree({ ...fourGenerationTree, name: '导入成功版本' }))

    expect(store.current?.name).toBe('导入成功版本')
    expect(store.revision).toBe(1)
    expect(await repository.listRecoveryPoints()).toMatchObject([{ reason: 'before-import', treeName: fourGenerationTree.name }])
  })
})
