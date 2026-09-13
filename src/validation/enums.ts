import type {
  Calendar,
  DatePrecision,
  DateRecord,
  Gender,
  ParentChildType,
  ParentRole,
  PartnerType,
  Person,
  ParentChildRelationship,
  PartnerRelationship,
} from '../types'

const GENDERS: readonly Gender[] = ['male', 'female', 'unknown']
const PARENT_ROLES: readonly ParentRole[] = ['father', 'mother', 'unknown']
const PARENT_CHILD_TYPES: readonly ParentChildType[] = ['biological', 'adopted', 'step', 'guoji', 'unknown']
const PARTNER_TYPES: readonly PartnerType[] = ['married', 'partner', 'former_spouse', 'unknown']
const DATE_PRECISIONS: readonly DatePrecision[] = ['exact', 'month', 'year', 'approximate', 'unknown']
const CALENDARS: readonly Calendar[] = ['solar', 'lunar', 'unknown']

const isOneOf = <T extends string>(value: unknown, allowed: readonly T[]): value is T =>
  typeof value === 'string' && (allowed as readonly string[]).includes(value)

export function isGender(value: unknown): value is Gender {
  return isOneOf(value, GENDERS)
}

export function isParentRole(value: unknown): value is ParentRole {
  return isOneOf(value, PARENT_ROLES)
}

export function isParentChildType(value: unknown): value is ParentChildType {
  return isOneOf(value, PARENT_CHILD_TYPES)
}

export function isPartnerType(value: unknown): value is PartnerType {
  return isOneOf(value, PARTNER_TYPES)
}

export function isDatePrecision(value: unknown): value is DatePrecision {
  return isOneOf(value, DATE_PRECISIONS)
}

export function isCalendar(value: unknown): value is Calendar {
  return isOneOf(value, CALENDARS)
}

export function validateDateRecordEnums(date: DateRecord | undefined, label: string): string[] {
  if (!date) return []
  const issues: string[] = []
  if (!isDatePrecision(date.precision)) issues.push(`${label}精度无效`)
  if (date.calendar !== undefined && !isCalendar(date.calendar)) issues.push(`${label}历法无效`)
  return issues
}

export function validatePersonEnums(person: Person): string[] {
  const issues: string[] = []
  if (!person.id?.trim()) issues.push('人物 ID 不能为空')
  if (typeof person.name !== 'string' || !person.name.trim()) {
    issues.push(`人物 ${person.id || '（未知）'} 的姓名不能为空`)
  }
  if (!isGender(person.gender)) issues.push(`人物 ${person.id} 的性别无效`)
  if (typeof person.isDeceased !== 'boolean') issues.push(`人物 ${person.id} 的在世状态无效`)
  issues.push(...validateDateRecordEnums(person.birth, `人物 ${person.id} 出生日期`))
  issues.push(...validateDateRecordEnums(person.death, `人物 ${person.id} 去世日期`))
  return issues
}

export function validateParentChildEnums(relationship: ParentChildRelationship): string[] {
  const issues: string[] = []
  if (!relationship.id?.trim()) issues.push('亲子关系 ID 不能为空')
  if (!isParentRole(relationship.parentRole)) {
    issues.push(`亲子关系 ${relationship.id} 的 parentRole 无效`)
  }
  if (!isParentChildType(relationship.relationshipType)) {
    issues.push(`亲子关系 ${relationship.id} 的 relationshipType 无效`)
  }
  return issues
}

export function validatePartnerEnums(relationship: PartnerRelationship): string[] {
  const issues: string[] = []
  if (!relationship.id?.trim()) issues.push('配偶关系 ID 不能为空')
  if (!isPartnerType(relationship.relationshipType)) {
    issues.push(`配偶关系 ${relationship.id} 的 relationshipType 无效`)
  }
  issues.push(...validateDateRecordEnums(relationship.startDate, `配偶关系 ${relationship.id} 开始日期`))
  issues.push(...validateDateRecordEnums(relationship.endDate, `配偶关系 ${relationship.id} 结束日期`))
  return issues
}

/**
 * father → male only; mother → female only; unknown role allows any gender.
 * unknown gender cannot hold father/mother roles.
 */
export function validateParentRoleMatchesGender(
  parent: Pick<Person, 'id' | 'name' | 'gender'>,
  parentRole: ParentRole,
): string[] {
  if (parentRole === 'unknown') return []
  if (parentRole === 'father') {
    if (parent.gender !== 'male') {
      return [`「${parent.name || parent.id}」性别不是男性，不能设为父亲`]
    }
  }
  if (parentRole === 'mother') {
    if (parent.gender !== 'female') {
      return [`「${parent.name || parent.id}」性别不是女性，不能设为母亲`]
    }
  }
  return []
}

/** Tree-level check: every father/mother edge must match parent gender. */
export function validateParentRolesAgainstGenders(
  persons: Person[],
  relationships: ParentChildRelationship[],
): string[] {
  const byId = new Map(persons.map((person) => [person.id, person]))
  const issues: string[] = []
  relationships.forEach((relationship) => {
    const parent = byId.get(relationship.parentId)
    if (!parent) return
    issues.push(
      ...validateParentRoleMatchesGender(parent, relationship.parentRole).map(
        (message) => `亲子关系 ${relationship.id}：${message}`,
      ),
    )
  })
  return issues
}
