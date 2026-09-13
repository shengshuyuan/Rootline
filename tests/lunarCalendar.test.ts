import { describe, expect, it } from 'vitest'
import { validateDateRecord } from '../src/validation'
import {
  getLunarMonthDayCount,
  isValidLunarCivilDate,
  listLunarMonthsForYear,
} from '../src/utils/lunarCalendar'
import { formatLunarDateChinese } from '../src/utils/lunarDate'

describe('strict lunar civil dates', () => {
  it('rejects day 30 when the lunar month only has 29 days', () => {
    // 2020 正月 is 小月 (29 days)
    expect(getLunarMonthDayCount(2020, 1, false)).toBe(29)
    expect(isValidLunarCivilDate(2020, 1, 30, false)).toBe(false)
    expect(isValidLunarCivilDate(2020, 1, 29, false)).toBe(true)
    expect(
      validateDateRecord({ value: '2020-01-30', calendar: 'lunar', precision: 'exact' }),
    ).toEqual(expect.arrayContaining([expect.stringMatching(/不是有效农历日期/)]))
  })

  it('accepts real 三十 only on 大月', () => {
    // 2020 二月 is 大月
    expect(getLunarMonthDayCount(2020, 2, false)).toBe(30)
    expect(isValidLunarCivilDate(2020, 2, 30, false)).toBe(true)
    expect(validateDateRecord({ value: '2020-02-30', calendar: 'lunar', precision: 'exact' })).toEqual([])
  })

  it('lists 闰月 for leap years and validates leap-month day counts', () => {
    const months = listLunarMonthsForYear(2020)
    const leap = months.find((month) => month.leap)
    expect(leap).toBeTruthy()
    expect(leap!.label).toMatch(/^闰/)
    expect(leap!.dayCount).toBe(29)
    expect(isValidLunarCivilDate(2020, leap!.month, 30, true)).toBe(false)
    expect(isValidLunarCivilDate(2020, leap!.month, leap!.dayCount, true)).toBe(true)
    expect(
      validateDateRecord({
        value: `2020-${String(leap!.month).padStart(2, '0')}-30`,
        calendar: 'lunar',
        precision: 'exact',
        leapMonth: true,
      }),
    ).toEqual(expect.arrayContaining([expect.stringMatching(/不是有效农历日期/)]))
  })

  it('formats leap months in Chinese display', () => {
    expect(formatLunarDateChinese('2020-04-01', { leapMonth: true })).toBe('农历二〇二〇年闰四月初一')
  })
})
