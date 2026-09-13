import type { FamilyTree } from './familyTree'

export const FAMILY_TREE_EXPORT_FORMAT = 'rootline-family-tree' as const

/** Versioned container used for JSON backups. */
export interface FamilyTreeExportEnvelope {
  format: typeof FAMILY_TREE_EXPORT_FORMAT
  schemaVersion: string
  exportedAt: string
  tree: FamilyTree
}

export type RecoveryPointReason =
  | 'before-import'
  | 'before-delete'
  | 'before-migration'
  | 'before-restore'
  | 'manual'

/** Lightweight recovery-point metadata; the full snapshot stays in IndexedDB. */
export interface RecoveryPoint {
  id: string
  createdAt: string
  reason: RecoveryPointReason
  treeName?: string
  schemaVersion?: string
}
