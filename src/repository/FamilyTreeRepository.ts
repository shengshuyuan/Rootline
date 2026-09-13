import type { FamilyTree, RecoveryPoint, RecoveryPointReason } from '../types'

export class StorageConflictError extends Error {
  constructor(message = '数据已在其他窗口更新，请重新载入后再保存。') {
    super(message)
    this.name = 'StorageConflictError'
  }
}

export interface FamilyTreeRepository {
  load(): Promise<FamilyTree | null>
  save(tree: FamilyTree): Promise<void>
  replaceFromImport(tree: FamilyTree): Promise<void>
  /** Optional atomic import path: snapshot current data and replace it inside one storage transaction. */
  replaceFromImportWithRecovery?(tree: FamilyTree, reason?: RecoveryPointReason): Promise<void>
  export(): Promise<FamilyTree | null>
  /** Optional for lightweight/test adapters; the IndexedDB adapter implements all recovery methods. */
  createRecoveryPoint?(reason?: RecoveryPointReason): Promise<RecoveryPoint | null>
  listRecoveryPoints?(): Promise<RecoveryPoint[]>
  restoreRecoveryPoint?(id: string): Promise<FamilyTree>
  readRawForRecovery?(): Promise<unknown | null>
}
