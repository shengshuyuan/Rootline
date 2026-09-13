import { describe, expect, it } from 'vitest'
import { dateText } from '../src/utils/dateText'
import {
  formatLunarDateChinese,
  lunarDayLabel,
  lunarMonthLabel,
  toChineseDigits,
} from '../src/utils/lunarDate'
import { defaultGenderForRelation } from '../src/utils/relationDefaults'

describe('lunar Chinese labels', () => {
  it('formats year digits in Chinese', () => {
    expect(toChineseDigits(1940)).toBe('一九四〇')
    expect(toChineseDigits('2008')).toBe('二〇〇八')
  })

  it('uses traditional month names including 正月 and 腊月', () => {
    expect(lunarMonthLabel(1)).toBe('正月')
    expect(lunarMonthLabel(8)).toBe('八月')
    expect(lunarMonthLabel(11)).toBe('冬月')
    expect(lunarMonthLabel(12)).toBe('腊月')
  })

  it('uses 初/廿 day names like public almanacs', () => {
    expect(lunarDayLabel(1)).toBe('初一')
    expect(lunarDayLabel(10)).toBe('初十')
    expect(lunarDayLabel(11)).toBe('十一')
    expect(lunarDayLabel(16)).toBe('十六')
    expect(lunarDayLabel(20)).toBe('二十')
    expect(lunarDayLabel(21)).toBe('廿一')
    expect(lunarDayLabel(30)).toBe('三十')
  })

  it('renders full lunar date without Arabic month/day numbers', () => {
    expect(formatLunarDateChinese('1940-08-16')).toBe('农历一九四〇年八月十六')
    expect(formatLunarDateChinese('1964-04-18')).toBe('农历一九六四年四月十八')
  })

  it('dateText uses Chinese for lunar and keeps solar numeric', () => {
    expect(dateText({ value: '1940-08-16', precision: 'exact', calendar: 'lunar' })).toBe('一九四〇年八月十六')
    expect(dateText({ originalText: '农历一九四〇年八月十六', precision: 'exact', calendar: 'lunar' })).toBe('一九四〇年八月十六')
    expect(dateText({ value: '1918-08-21', precision: 'exact', calendar: 'solar' })).toBe('1918-08-21')
  })
})

describe('spouse gender shortcut', () => {
  it('defaults spouse to the opposite sex of the selected person', () => {
    expect(defaultGenderForRelation('spouse', 'male')).toBe('female')
    expect(defaultGenderForRelation('spouse', 'female')).toBe('male')
    expect(defaultGenderForRelation('father', 'female')).toBe('male')
    expect(defaultGenderForRelation('mother', 'male')).toBe('female')
  })
})
