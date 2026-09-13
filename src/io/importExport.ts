import type { FamilyTree, FamilyTreeExportEnvelope } from '../types'
import { CURRENT_SCHEMA_VERSION, FAMILY_TREE_EXPORT_FORMAT } from '../types'
import {
  FamilyTreeValidationError,
  isCalendar,
  isDatePrecision,
  isGender,
  isParentChildType,
  isParentRole,
  isPartnerType,
  validateFamilyTree,
} from '../validation'
import type { FamilyTreeRepository } from '../repository/FamilyTreeRepository'
import { migrateFamilyTreeData, type FamilyTreeMigrationResult } from './migrations'

export const MAX_IMPORT_BYTES = 5 * 1024 * 1024

const hasArray = (value: Record<string, unknown>, key: string) => Array.isArray(value[key])
const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)

const validateOptionalString = (value: unknown, label: string): string[] =>
  value === undefined || typeof value === 'string' ? [] : [`${label}必须是字符串`]

const validateOptionalStringArray = (value: unknown, label: string): string[] => {
  if (value === undefined) return []
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string')) {
    return [`${label}必须是字符串数组`]
  }
  return []
}

function validateOptionalDateRecord(value: unknown, label: string): string[] {
  if (value === undefined || value === null) return []
  if (!isRecord(value)) return [`${label}必须是对象`]
  const issues: string[] = []
  if (value.value !== undefined && typeof value.value !== 'string') issues.push(`${label}.value 必须是字符串`)
  if (value.originalText !== undefined && typeof value.originalText !== 'string') {
    issues.push(`${label}.originalText 必须是字符串`)
  }
  if (!isDatePrecision(value.precision)) issues.push(`${label}.precision 无效`)
  if (value.calendar !== undefined && !isCalendar(value.calendar)) issues.push(`${label}.calendar 无效`)
  return issues
}

/**
 * Structural + enum checks before casting to FamilyTree.
 * Illegal enums must fail here so replace never runs.
 */
function validateImportShape(candidate: Record<string, unknown>): string[] {
  const issues: string[] = []
  const requiredString = ['id', 'name', 'schemaVersion', 'createdAt', 'updatedAt']
  requiredString.forEach((key) => {
    if (typeof candidate[key] !== 'string' || !(candidate[key] as string).trim()) {
      issues.push(`导入文件的 ${key} 必须是非空字符串`)
    }
  })
  ;['persons', 'parentChildRelationships', 'partnerRelationships'].forEach((key) => {
    if (!hasArray(candidate, key)) issues.push(`导入文件的 ${key} 必须是数组`)
  })

  const persons = candidate.persons
  if (Array.isArray(persons)) {
    persons.forEach((value, index) => {
      const label = `第 ${index + 1} 个人物`
      if (!isRecord(value)) {
        issues.push(`${label}必须是对象`)
        return
      }
      if (typeof value.id !== 'string' || !value.id.trim()) issues.push(`${label} id 无效`)
      if (typeof value.name !== 'string' || !value.name.trim()) issues.push(`${label} 姓名不能为空`)
      if (!isGender(value.gender)) issues.push(`${label} gender 无效（须为 male / female / unknown）`)
      if (typeof value.isDeceased !== 'boolean') issues.push(`${label} isDeceased 必须是布尔值`)
      if (typeof value.createdAt !== 'string' || typeof value.updatedAt !== 'string') {
        issues.push(`${label} 缺少 createdAt/updatedAt`)
      }
      issues.push(...validateOptionalStringArray(value.formerNames, `${label} formerNames`))
      ;['generationName', 'rank', 'ancestralHome', 'birthplace', 'occupation', 'biography', 'notes'].forEach((key) => {
        issues.push(...validateOptionalString(value[key], `${label} ${key}`))
      })
      if (value.generation !== undefined && typeof value.generation !== 'number') {
        issues.push(`${label} generation 必须是数字`)
      }
      issues.push(...validateOptionalDateRecord(value.birth, `${label} birth`))
      issues.push(...validateOptionalDateRecord(value.death, `${label} death`))
      if (value.birth && isRecord(value.birth) && value.birth.leapMonth !== undefined && typeof value.birth.leapMonth !== 'boolean') {
        issues.push(`${label} birth.leapMonth 必须是布尔值`)
      }
      if (value.death && isRecord(value.death) && value.death.leapMonth !== undefined && typeof value.death.leapMonth !== 'boolean') {
        issues.push(`${label} death.leapMonth 必须是布尔值`)
      }
    })
  }

  const parentChildRelationships = candidate.parentChildRelationships
  if (Array.isArray(parentChildRelationships)) {
    parentChildRelationships.forEach((value, index) => {
      const label = `第 ${index + 1} 条亲子关系`
      if (!isRecord(value)) {
        issues.push(`${label}必须是对象`)
        return
      }
      if (typeof value.id !== 'string' || !value.id.trim()) issues.push(`${label} id 无效`)
      if (typeof value.parentId !== 'string' || typeof value.childId !== 'string') {
        issues.push(`${label} parentId/childId 无效`)
      }
      if (!isParentRole(value.parentRole)) {
        issues.push(`${label} parentRole 无效（须为 father / mother / unknown）`)
      }
      if (!isParentChildType(value.relationshipType)) {
        issues.push(`${label} relationshipType 无效`)
      }
      if (typeof value.createdAt !== 'string' || typeof value.updatedAt !== 'string') {
        issues.push(`${label} 缺少 createdAt/updatedAt`)
      }
      issues.push(...validateOptionalString(value.notes, `${label} notes`))
    })
  }

  const partnerRelationships = candidate.partnerRelationships
  if (Array.isArray(partnerRelationships)) {
    partnerRelationships.forEach((value, index) => {
      const label = `第 ${index + 1} 条配偶关系`
      if (!isRecord(value)) {
        issues.push(`${label}必须是对象`)
        return
      }
      if (typeof value.id !== 'string' || !value.id.trim()) issues.push(`${label} id 无效`)
      if (typeof value.person1Id !== 'string' || typeof value.person2Id !== 'string') {
        issues.push(`${label} person1Id/person2Id 无效`)
      }
      if (!isPartnerType(value.relationshipType)) {
        issues.push(`${label} relationshipType 无效`)
      }
      if (typeof value.createdAt !== 'string' || typeof value.updatedAt !== 'string') {
        issues.push(`${label} 缺少 createdAt/updatedAt`)
      }
      issues.push(...validateOptionalString(value.notes, `${label} notes`))
      issues.push(...validateOptionalDateRecord(value.startDate, `${label} startDate`))
      issues.push(...validateOptionalDateRecord(value.endDate, `${label} endDate`))
    })
  }

  return issues
}

export interface FamilyTreeSummary {
  name: string
  surname?: string
  personCount: number
  parentChildCount: number
  partnerCount: number
  schemaVersion: string
}

export function summarizeFamilyTree(tree: FamilyTree): FamilyTreeSummary {
  return {
    name: tree.name,
    surname: tree.surname,
    personCount: tree.persons.length,
    parentChildCount: tree.parentChildRelationships.length,
    partnerCount: tree.partnerRelationships.length,
    schemaVersion: tree.schemaVersion,
  }
}

export interface ParsedFamilyTreeData {
  tree: FamilyTree
  sourceVersion: string
  migrated: boolean
  appliedVersions: string[]
}

function unwrapExportEnvelope(parsed: Record<string, unknown>): Record<string, unknown> {
  const isEnvelope = parsed.format !== undefined || parsed.tree !== undefined
  if (!isEnvelope) return parsed

  const issues: string[] = []
  if (parsed.format !== FAMILY_TREE_EXPORT_FORMAT) issues.push('导入文件的 format 无效')
  if (typeof parsed.schemaVersion !== 'string' || !parsed.schemaVersion.trim()) {
    issues.push('导入文件的 schemaVersion 必须是非空字符串')
  }
  if (typeof parsed.exportedAt !== 'string' || !parsed.exportedAt.trim()) {
    issues.push('导入文件的 exportedAt 必须是非空字符串')
  }
  if (!isRecord(parsed.tree)) issues.push('导入文件的 tree 必须是族谱对象')
  if (isRecord(parsed.tree) && parsed.schemaVersion !== parsed.tree.schemaVersion) {
    issues.push('导入文件的 schemaVersion 与 tree.schemaVersion 不一致')
  }
  if (issues.length) throw new FamilyTreeValidationError(issues)
  return parsed.tree as Record<string, unknown>
}

/** Parse an already-decoded value, migrate it, then validate the current schema. */
export function parseFamilyTreeDataWithMetadata(parsed: unknown): ParsedFamilyTreeData {
  if (!isRecord(parsed)) throw new FamilyTreeValidationError(['导入文件必须是族谱对象'])
  const candidate = unwrapExportEnvelope(parsed)
  const migration: FamilyTreeMigrationResult = migrateFamilyTreeData(candidate)
  const shapeIssues = validateImportShape(migration.data)
  if (shapeIssues.length) throw new FamilyTreeValidationError(shapeIssues)
  const tree = migration.data as unknown as FamilyTree
  const issues = validateFamilyTree(tree)
  if (issues.length) throw new FamilyTreeValidationError(issues)
  return {
    tree: structuredClone(tree),
    sourceVersion: migration.sourceVersion,
    migrated: migration.migrated,
    appliedVersions: [...migration.appliedVersions],
  }
}

export function parseFamilyTreeData(parsed: unknown): FamilyTree {
  return parseFamilyTreeDataWithMetadata(parsed).tree
}

export function parseFamilyTreeJson(json: string): FamilyTree {
  if (new TextEncoder().encode(json).byteLength > MAX_IMPORT_BYTES) {
    throw new FamilyTreeValidationError(['导入文件不能超过 5 MB'])
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    throw new FamilyTreeValidationError(['导入文件不是合法 JSON'])
  }
  return parseFamilyTreeData(parsed)
}

export function stringifyFamilyTree(tree: FamilyTree): string {
  const issues = validateFamilyTree(tree)
  if (issues.length) throw new FamilyTreeValidationError(issues)
  const envelope: FamilyTreeExportEnvelope = {
    format: FAMILY_TREE_EXPORT_FORMAT,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    tree: structuredClone(tree),
  }
  return JSON.stringify(envelope, null, 2)
}

/** Parse and validate completely before replacing persisted data. */
export async function importAndReplace(repository: FamilyTreeRepository, json: string): Promise<FamilyTree> {
  const tree = parseFamilyTreeJson(json)
  if (repository.replaceFromImportWithRecovery) {
    await repository.replaceFromImportWithRecovery(tree, 'before-import')
  } else {
    await repository.createRecoveryPoint?.('before-import')
    await repository.replaceFromImport(tree)
  }
  return tree
}
