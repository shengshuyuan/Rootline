import { CURRENT_SCHEMA_VERSION } from '../types'
import { FamilyTreeValidationError } from '../validation'

export interface FamilyTreeMigration {
  fromVersion: string
  toVersion: string
  migrate(data: Record<string, unknown>): Record<string, unknown>
}

export interface FamilyTreeMigrationResult {
  data: Record<string, unknown>
  sourceVersion: string
  targetVersion: string
  migrated: boolean
  appliedVersions: string[]
}

/**
 * Registered forward-only schema migrations. Keep each step small and immutable;
 * import and IndexedDB loading both execute this same chain.
 */
export const FAMILY_TREE_MIGRATIONS: readonly FamilyTreeMigration[] = [
  {
    fromVersion: '0.9.0',
    toVersion: '1.0.0',
    migrate: (data) => ({ ...structuredClone(data), schemaVersion: '1.0.0' }),
  },
]

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)

/** Run a supplied migration registry, making the mechanism independently testable. */
export function migrateFamilyTreeData(
  input: unknown,
  migrations: readonly FamilyTreeMigration[] = FAMILY_TREE_MIGRATIONS,
  targetVersion: string = CURRENT_SCHEMA_VERSION,
): FamilyTreeMigrationResult {
  if (!isRecord(input)) {
    throw new FamilyTreeValidationError(['导入文件必须是族谱对象'])
  }

  const sourceVersion = input.schemaVersion
  if (typeof sourceVersion !== 'string' || !sourceVersion.trim()) {
    throw new FamilyTreeValidationError(['不支持的数据版本：缺失'])
  }

  let current = structuredClone(input)
  let version = sourceVersion
  const appliedVersions: string[] = []
  const visited = new Set<string>()

  while (version !== targetVersion) {
    if (visited.has(version)) {
      throw new FamilyTreeValidationError([`数据迁移链存在循环：${version}`])
    }
    visited.add(version)

    const candidates = migrations.filter((migration) => migration.fromVersion === version)
    if (candidates.length !== 1) {
      throw new FamilyTreeValidationError([`不支持的数据版本：${version}`])
    }

    const migration = candidates[0]
    current = migration.migrate(structuredClone(current))
    if (!isRecord(current) || current.schemaVersion !== migration.toVersion) {
      throw new FamilyTreeValidationError([
        `数据迁移 ${migration.fromVersion} → ${migration.toVersion} 未生成正确版本`,
      ])
    }
    version = migration.toVersion
    appliedVersions.push(version)
  }

  return {
    data: current,
    sourceVersion,
    targetVersion: version,
    migrated: appliedVersions.length > 0,
    appliedVersions,
  }
}
