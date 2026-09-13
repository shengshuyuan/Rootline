import type { DateRecord, PartnerRelationship, Person } from '../types'
import { isValidLunarCivilDate } from '../utils/lunarCalendar'

type DateParts = { year: number; month: number; day: number }

const parseDateParts = (value?: string): DateParts | undefined => {
  if (!value) return undefined
  const match = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/.exec(value)
  if (!match) return undefined
  return { year: Number(match[1]), month: match[2] ? Number(match[2]) : 1, day: match[3] ? Number(match[3]) : 1 }
}

const isValidSolarDate = ({ year, month, day }: DateParts): boolean => {
  const parsed = new Date(Date.UTC(year, month - 1, day))
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day
}

const calendarForComparison = (date: DateRecord): 'solar' | 'lunar' | undefined => {
  if (date.calendar === 'solar' || date.calendar === 'lunar') return date.calendar
  // Existing records did not persist a calendar. Their legacy YYYY/MM/DD values
  // were interpreted as Gregorian dates and retain that behavior.
  return date.calendar === undefined ? 'solar' : undefined
}

const comparableDate = (date?: DateRecord): { calendar: 'solar' | 'lunar'; value: string } | undefined => {
  if (!date?.value || date.precision === 'approximate' || date.precision === 'unknown') return undefined
  const calendar = calendarForComparison(date)
  const parts = parseDateParts(date.value)
  if (!calendar || !parts) return undefined
  if (calendar === 'solar' && !isValidSolarDate(parts)) return undefined
  if (
    calendar === 'lunar'
    && (!isValidLunarCivilDate(parts.year, parts.month, parts.day, Boolean(date.leapMonth)) || date.precision !== 'exact')
  ) {
    return undefined
  }
  return { calendar, value: date.value }
}

export function validateDateRecord(date?: DateRecord, label = '日期'): string[] {
  if (!date) return []
  if (!date.precision) return [`${label}缺少精度`]
  if (!date.value) return []
  const parts = parseDateParts(date.value)
  if (!parts) return [`${label}格式无效`]

  const isSelectedCalendarDate = date.calendar === 'solar' || date.calendar === 'lunar'
  if (isSelectedCalendarDate && (date.precision !== 'exact' || !/^\d{4}-\d{2}-\d{2}$/.test(date.value))) {
    return [`${label}需选择完整的年月日`]
  }
  if (date.precision === 'exact' && !/^\d{4}-\d{2}-\d{2}$/.test(date.value)) return [`${label}格式无效`]
  if (date.calendar === 'solar' && !isValidSolarDate(parts)) return [`${label}不是有效日期`]
  if (date.calendar === 'lunar') {
    if (date.leapMonth !== undefined && typeof date.leapMonth !== 'boolean') {
      return [`${label}闰月标记无效`]
    }
    if (!isValidLunarCivilDate(parts.year, parts.month, parts.day, Boolean(date.leapMonth))) {
      return [`${label}不是有效农历日期（该月无此日或闰月不存在）`]
    }
  }
  // Keep legacy partial Gregorian dates working while rejecting impossible month/day values.
  if (date.calendar === undefined && !isValidSolarDate(parts)) return [`${label}不是有效日期`]
  return []
}

export function validatePersonDates(person: Pick<Person, 'birth' | 'death' | 'isDeceased'>): string[] {
  const issues = [...validateDateRecord(person.birth, '出生日期'), ...validateDateRecord(person.death, '去世日期')]
  const birth = comparableDate(person.birth)
  const death = comparableDate(person.death)
  if (birth && death && birth.calendar === death.calendar && death.value < birth.value) issues.push('去世日期不能早于出生日期')
  if (!person.isDeceased && person.death?.value) issues.push('在世人物不能填写明确的去世日期')
  return issues
}

/** Validate partner dates with the same date rules used for person records. */
export function validatePartnerDates(relationship: Pick<PartnerRelationship, 'startDate' | 'endDate'>): string[] {
  const issues = [
    ...validateDateRecord(relationship.startDate, '开始日期'),
    ...validateDateRecord(relationship.endDate, '结束日期'),
  ]
  const start = comparableDate(relationship.startDate)
  const end = comparableDate(relationship.endDate)
  if (start && end && start.calendar === end.calendar && end.value < start.value) {
    issues.push('结束日期不能早于开始日期')
  }
  return issues
}
