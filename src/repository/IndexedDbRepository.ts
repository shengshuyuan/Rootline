import Dexie, { type EntityTable } from 'dexie'
import { nanoid } from 'nanoid'
import { parseFamilyTreeDataWithMetadata } from '../io/importExport'
import type { FamilyTree, RecoveryPoint, RecoveryPointReason } from '../types'
import { FamilyTreeValidationError, validateFamilyTree } from '../validation'
import { StorageConflictError, type FamilyTreeRepository } from './FamilyTreeRepository'

export const MAX_RECOVERY_POINTS = 20

interface StoredTreeRecord extends Record<string, unknown> {
  key: 'active'
  revision?: number
  updatedAt?: string
}

interface StoredRecoveryPoint extends RecoveryPoint {
  tree: unknown
}

class RootlineDatabase extends Dexie {
  trees!: EntityTable<StoredTreeRecord, 'key'>
  recoveryPoints!: EntityTable<StoredRecoveryPoint, 'id'>

  constructor() {
    super('rootline')
    this.version(1).stores({ trees: 'key, updatedAt' })
    this.version(2).stores({
      trees: 'key, updatedAt',
      recoveryPoints: 'id, createdAt',
    })
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)

const withoutStorageKey = (stored: StoredTreeRecord): Record<string, unknown> => {
  const { key: _key, revision: _revision, ...tree } = stored
  return tree
}

const asStoredTree = (tree: FamilyTree, revision: number): StoredTreeRecord => ({
  ...structuredClone(tree),
  key: 'active',
  revision,
})

const storedRevision = (stored: StoredTreeRecord | undefined): number | null => {
  if (!stored) return null
  return typeof stored.revision === 'number' && Number.isFinite(stored.revision) && stored.revision >= 0
    ? stored.revision
    : 0
}

export function assertFreshStorageRevision(
  observedRevision: number | null,
  currentRevision: number | null,
): void {
  if (observedRevision === currentRevision) return
  throw new StorageConflictError()
}

export function recoveryPointIdsToPrune(
  points: ReadonlyArray<Pick<RecoveryPoint, 'id' | 'createdAt'>>,
  limit = MAX_RECOVERY_POINTS,
): string[] {
  if (limit < 0) throw new RangeError('恢复点数量上限不能小于 0')
  return [...points]
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id))
    .slice(0, Math.max(0, points.length - limit))
    .map((point) => point.id)
}

export class IndexedDbFamilyTreeRepository implements FamilyTreeRepository {
  private readonly db = new RootlineDatabase()
  private observedRevision: number | null = null

  async load(): Promise<FamilyTree | null> {
    let observedInvalidRevision: number | null | undefined
    try {
      const result = await this.db.transaction('rw', this.db.trees, this.db.recoveryPoints, async () => {
        const stored = await this.db.trees.get('active')
        if (!stored) return { tree: null, revision: null }
        const currentRevision = storedRevision(stored)
        observedInvalidRevision = currentRevision
        const raw = withoutStorageKey(stored)
        const parsed = parseFamilyTreeDataWithMetadata(raw)
        let nextRevision = currentRevision

        if (parsed.migrated) {
          await this.addRecoveryPoint(raw, 'before-migration')
          nextRevision = (nextRevision ?? 0) + 1
          await this.db.trees.put(asStoredTree(parsed.tree, nextRevision))
          await this.pruneRecoveryPoints()
        }

        return { tree: structuredClone(parsed.tree), revision: nextRevision }
      })
      this.observedRevision = result.revision
      return result.tree
    } catch (error) {
      if (observedInvalidRevision !== undefined) this.observedRevision = observedInvalidRevision
      throw error
    }
  }

  async save(tree: FamilyTree): Promise<void> {
    this.assertValid(tree)
    const nextRevision = await this.db.transaction('rw', this.db.trees, async () => {
      return this.putFreshTree(tree)
    })
    this.observedRevision = nextRevision
  }

  async replaceFromImport(tree: FamilyTree): Promise<void> {
    this.assertValid(tree)
    const nextRevision = await this.db.transaction('rw', this.db.trees, async () => {
      return this.putFreshTree(tree)
    })
    this.observedRevision = nextRevision
  }

  async replaceFromImportWithRecovery(
    tree: FamilyTree,
    reason: RecoveryPointReason = 'before-import',
  ): Promise<void> {
    this.assertValid(tree)
    const nextRevision = await this.db.transaction('rw', this.db.trees, this.db.recoveryPoints, async () => {
      const current = await this.db.trees.get('active')
      const currentRevision = storedRevision(current)
      assertFreshStorageRevision(this.observedRevision, currentRevision)
      if (current) await this.addRecoveryPoint(withoutStorageKey(current), reason)
      const nextRevision = (currentRevision ?? 0) + 1
      await this.db.trees.put(asStoredTree(tree, nextRevision))
      await this.pruneRecoveryPoints()
      return nextRevision
    })
    this.observedRevision = nextRevision
  }

  async export(): Promise<FamilyTree | null> {
    return this.db.transaction('r', this.db.trees, async () => {
      const stored = await this.db.trees.get('active')
      if (!stored) return null
      return parseFamilyTreeDataWithMetadata(withoutStorageKey(stored)).tree
    })
  }

  async createRecoveryPoint(reason: RecoveryPointReason = 'manual'): Promise<RecoveryPoint | null> {
    return this.db.transaction('rw', this.db.trees, this.db.recoveryPoints, async () => {
      const stored = await this.db.trees.get('active')
      if (!stored) return null
      assertFreshStorageRevision(this.observedRevision, storedRevision(stored))
      const point = await this.addRecoveryPoint(withoutStorageKey(stored), reason)
      await this.pruneRecoveryPoints()
      return point
    })
  }

  async listRecoveryPoints(): Promise<RecoveryPoint[]> {
    const stored = await this.db.recoveryPoints.orderBy('createdAt').reverse().toArray()
    return stored.map(({ tree: _tree, ...metadata }) => structuredClone(metadata))
  }

  async restoreRecoveryPoint(id: string): Promise<FamilyTree> {
    const result = await this.db.transaction('rw', this.db.trees, this.db.recoveryPoints, async () => {
      const point = await this.db.recoveryPoints.get(id)
      if (!point) throw new FamilyTreeValidationError(['未找到恢复点'])
      const restored = parseFamilyTreeDataWithMetadata(point.tree).tree

      const current = await this.db.trees.get('active')
      const currentRevision = storedRevision(current)
      assertFreshStorageRevision(this.observedRevision, currentRevision)
      if (current) await this.addRecoveryPoint(withoutStorageKey(current), 'before-restore')
      const nextRevision = (currentRevision ?? 0) + 1
      await this.db.trees.put(asStoredTree(restored, nextRevision))
      await this.pruneRecoveryPoints()
      return { tree: structuredClone(restored), revision: nextRevision }
    })
    this.observedRevision = result.revision
    return result.tree
  }

  async readRawForRecovery(): Promise<unknown | null> {
    const stored = await this.db.trees.get('active')
    return stored ? structuredClone(withoutStorageKey(stored)) : null
  }

  private async addRecoveryPoint(tree: unknown, reason: RecoveryPointReason): Promise<RecoveryPoint> {
    const createdAt = new Date().toISOString()
    const point: StoredRecoveryPoint = {
      id: nanoid(),
      createdAt,
      reason,
      treeName: isRecord(tree) && typeof tree.name === 'string' ? tree.name : undefined,
      schemaVersion: isRecord(tree) && typeof tree.schemaVersion === 'string' ? tree.schemaVersion : undefined,
      tree: structuredClone(tree),
    }
    await this.db.recoveryPoints.add(point)
    const { tree: _tree, ...metadata } = point
    return structuredClone(metadata)
  }

  private async pruneRecoveryPoints(): Promise<void> {
    const all = await this.db.recoveryPoints.orderBy('createdAt').toArray()
    const ids = recoveryPointIdsToPrune(all)
    if (ids.length) await this.db.recoveryPoints.bulkDelete(ids)
  }

  private async putFreshTree(tree: FamilyTree): Promise<number> {
    const current = await this.db.trees.get('active')
    const currentRevision = storedRevision(current)
    assertFreshStorageRevision(this.observedRevision, currentRevision)
    const nextRevision = (currentRevision ?? 0) + 1
    await this.db.trees.put(asStoredTree(tree, nextRevision))
    return nextRevision
  }

  private assertValid(tree: FamilyTree): void {
    const issues = validateFamilyTree(tree)
    if (issues.length) throw new FamilyTreeValidationError(issues)
  }
}
