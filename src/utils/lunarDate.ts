/**
 * Traditional Chinese lunar date labels used by almanacs / 万年历 UIs.
 * Storage remains machine-friendly `YYYY-MM-DD`; display uses Chinese.
 *
 * Common public practice (万年历、农民历、百科「农历日期表示」):
 * - year: Chinese digits + 年, e.g. 一九四〇年
 * - month: 正月…腊月 (闰月可前缀「闰」, MVP 未建模闰月)
 * - day: 初一…初十、十一…二十、廿一…三十
 */

const DIGITS = ['〇', '一', '二', '三', '四', '五', '六', '七', '八', '九'] as const

const LUNAR_MONTHS = [
  '正月', '二月', '三月', '四月', '五月', '六月',
  '七月', '八月', '九月', '十月', '冬月', '腊月',
] as const

/** Convert a non-negative integer to Chinese digits (一九四〇). */
export function toChineseDigits(n: number | string): string {
  return String(n).replace(/\d/g, (digit) => DIGITS[Number(digit)] ?? digit)
}

/** 1–12 → 正月…腊月 */
export function lunarMonthLabel(month: number): string {
  if (month < 1 || month > 12) return `${month}月`
  return LUNAR_MONTHS[month - 1]
}

/** 1–30 → 初一…三十 (廿 for 20s, matching common almanac style) */
export function lunarDayLabel(day: number): string {
  if (day < 1 || day > 30) return `${day}日`
  if (day < 10) return `初${DIGITS[day]}`
  if (day === 10) return '初十'
  if (day < 20) return `十${DIGITS[day - 10]}`
  if (day === 20) return '二十'
  if (day < 30) return `廿${DIGITS[day - 20]}`
  return '三十'
}

export function parseYmd(value?: string): { year: number; month: number; day: number } | undefined {
  if (!value) return undefined
  const match = /^(\d{1,4})-(\d{1,2})-(\d{1,2})$/.exec(value.trim())
  if (!match) return undefined
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (!year || month < 1 || month > 12 || day < 1 || day > 30) return undefined
  return { year, month, day }
}

/**
 * Format a stored lunar `YYYY-MM-DD` as e.g. 农历一九四〇年八月十六.
 * Pass leapMonth for 闰月 display: 农历二〇二〇年闰四月初一.
 */
export function formatLunarDateChinese(
  value?: string,
  options: { prefix?: boolean; leapMonth?: boolean } = {},
): string {
  const parts = parseYmd(value)
  const prefix = options.prefix === false ? '' : '农历'
  if (!parts) {
    if (!value) return '未记录'
    return prefix ? `${prefix}${value}` : value
  }
  const monthLabel = options.leapMonth
    ? `闰${lunarMonthLabel(parts.month)}`
    : lunarMonthLabel(parts.month)
  const body = `${toChineseDigits(parts.year)}年${monthLabel}${lunarDayLabel(parts.day)}`
  return prefix ? `${prefix}${body}` : body
}

/** Dropdown options for the lunar month picker. */
export function lunarMonthOptions(): Array<{ value: string; label: string }> {
  return LUNAR_MONTHS.map((label, index) => ({
    value: String(index + 1).padStart(2, '0'),
    label,
  }))
}

/** Dropdown options for the lunar day picker (1–30). */
export function lunarDayOptions(): Array<{ value: string; label: string }> {
  return Array.from({ length: 30 }, (_, index) => {
    const day = index + 1
    return {
      value: String(day).padStart(2, '0'),
      label: lunarDayLabel(day),
    }
  })
}

/** Year option label: 一九四〇年 (value remains 1940). */
export function lunarYearLabel(year: string | number): string {
  return `${toChineseDigits(year)}年`
}
