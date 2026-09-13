/**
 * Real civil lunar month lengths via lunar-javascript (6tail).
 * Leap months are encoded as negative month numbers by the library (e.g. -4 = 闰四月).
 */
import { Lunar, LunarYear } from 'lunar-javascript'
import { lunarDayLabel, lunarMonthLabel } from './lunarDate'

export interface LunarMonthOption {
  /** 1–12 civil month number (absolute). */
  month: number
  leap: boolean
  dayCount: number
  /** Select value e.g. "04" or "04L" for leap. */
  value: string
  label: string
}

function lunarMonthKey(month: number, leap: boolean): string {
  return `${String(month).padStart(2, '0')}${leap ? 'L' : ''}`
}

export function parseLunarMonthKey(value: string): { month: number; leap: boolean } | undefined {
  const match = /^(\d{1,2})(L)?$/i.exec(value.trim())
  if (!match) return undefined
  const month = Number(match[1])
  if (month < 1 || month > 12) return undefined
  return { month, leap: Boolean(match[2]) }
}

/** Day count for a specific lunar year/month (optionally leap). null if out of table. */
export function getLunarMonthDayCount(year: number, month: number, leap = false): number | null {
  if (year < 1 || month < 1 || month > 12) return null
  try {
    const months = LunarYear.fromYear(year).getMonths() as Array<{
      getYear: () => number
      getMonth: () => number
      isLeap: () => boolean
      getDayCount: () => number
    }>
    const target = leap ? -month : month
    const found = months.find((entry) => entry.getYear() === year && entry.getMonth() === target)
    return found ? found.getDayCount() : null
  } catch {
    return null
  }
}

/** True when y/m/d exists in the civil lunar calendar (respects 大小月 & 闰月). */
export function isValidLunarCivilDate(year: number, month: number, day: number, leap = false): boolean {
  if (day < 1 || day > 30 || month < 1 || month > 12) return false
  try {
    const lunarMonth = leap ? -month : month
    Lunar.fromYmd(year, lunarMonth, day)
    return true
  } catch {
    return false
  }
}

/** Months available in a lunar year, including 闰X月 when present. */
export function listLunarMonthsForYear(year: number): LunarMonthOption[] {
  try {
    const months = LunarYear.fromYear(year).getMonths() as Array<{
      getYear: () => number
      getMonth: () => number
      isLeap: () => boolean
      getDayCount: () => number
    }>
    return months
      .filter((entry) => entry.getYear() === year)
      .map((entry) => {
        const raw = entry.getMonth()
        const leap = entry.isLeap() || raw < 0
        const month = Math.abs(raw)
        return {
          month,
          leap,
          dayCount: entry.getDayCount(),
          value: lunarMonthKey(month, leap),
          label: leap ? `闰${lunarMonthLabel(month)}` : lunarMonthLabel(month),
        }
      })
  } catch {
    // Fallback: 12 months × max 30 (still validated on commit via fromYmd)
    return Array.from({ length: 12 }, (_, index) => {
      const month = index + 1
      return {
        month,
        leap: false,
        dayCount: 30,
        value: lunarMonthKey(month, false),
        label: lunarMonthLabel(month),
      }
    })
  }
}

export function lunarDayOptionsForMonth(year: number, month: number, leap = false): Array<{ value: string; label: string }> {
  const count = getLunarMonthDayCount(year, month, leap) ?? 30
  return Array.from({ length: count }, (_, index) => {
    const day = index + 1
    return {
      value: String(day).padStart(2, '0'),
      label: lunarDayLabel(day),
    }
  })
}
