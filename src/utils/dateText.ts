import type { DateRecord } from '../types'
import { formatLunarDateChinese } from './lunarDate'

/**
 * Human-readable date for cards / detail panel.
 * Solar: 1918-08-21 (or originalText if present without machine value)
 * Lunar: 一九四〇年八月十六 (traditional Chinese labels already identify the calendar)
 */
export function dateText(date?: DateRecord): string {
  if (!date) return '未记录'
  if (date.calendar === 'lunar') {
    if (date.value) return formatLunarDateChinese(date.value, { prefix: false, leapMonth: date.leapMonth })
    if (date.originalText?.trim()) return date.originalText.trim().replace(/^(农历|阴历)\s*/, '')
    return '未记录'
  }
  if (date.value) return date.value
  if (date.originalText?.trim()) return date.originalText.trim()
  return '未记录'
}
