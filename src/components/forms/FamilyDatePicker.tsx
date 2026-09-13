import { useEffect, useMemo, useState } from 'react'
import type { Calendar, DateRecord } from '../../types'
import {
  formatLunarDateChinese,
  lunarYearLabel,
} from '../../utils/lunarDate'
import {
  listLunarMonthsForYear,
  lunarDayOptionsForMonth,
  parseLunarMonthKey,
} from '../../utils/lunarCalendar'

// Ancestors often predate 19c; allow Gregorian years from 1600 through next year.
const YEAR_END = new Date().getFullYear() + 1
const YEAR_START = 1600
const YEARS = Array.from({ length: YEAR_END - YEAR_START + 1 }, (_, index) => String(YEAR_END - index))
const SOLAR_MONTHS = Array.from({ length: 12 }, (_, index) => String(index + 1).padStart(2, '0'))
const SOLAR_DAYS = Array.from({ length: 31 }, (_, index) => String(index + 1).padStart(2, '0'))

interface FamilyDatePickerProps {
  label: string
  value?: DateRecord
  onChange: (value?: DateRecord) => void
  error?: string
  optional?: boolean
}

interface LocalParts {
  year: string
  /** Solar: "01"–"12". Lunar: "01"–"12" or "04L" for leap. */
  month: string
  day: string
  calendar: Calendar
}

function partsFromValue(value?: DateRecord): LocalParts {
  const [year = '', monthNum = '', day = ''] = (value?.value ?? '').split('-')
  const month = value?.calendar === 'lunar' && value.leapMonth && monthNum
    ? `${monthNum}L`
    : monthNum
  return {
    year,
    month,
    day,
    calendar: value?.calendar === 'lunar' ? 'lunar' : 'solar',
  }
}

function isComplete(parts: LocalParts): boolean {
  return Boolean(parts.year && parts.month && parts.day)
}

function toRecord(parts: LocalParts): DateRecord {
  const lunar = parts.calendar === 'lunar'
  const monthMeta = lunar ? parseLunarMonthKey(parts.month) : { month: Number(parts.month), leap: false }
  const month = String(monthMeta?.month ?? parts.month).padStart(2, '0')
  const value = `${parts.year}-${month}-${parts.day}`
  const leapMonth = lunar ? Boolean(monthMeta?.leap) : undefined
  return {
    value,
    precision: 'exact',
    calendar: parts.calendar,
    leapMonth: leapMonth || undefined,
    originalText: lunar ? formatLunarDateChinese(value, { leapMonth }) : undefined,
  }
}

/**
 * Controlled date field that only commits complete yyyy-mm-dd records to the draft.
 * Lunar mode uses real 大小月 / 闰月 day counts from lunar-javascript.
 */
export function FamilyDatePicker({ label, value, onChange, error, optional }: FamilyDatePickerProps) {
  const [parts, setParts] = useState<LocalParts>(() => partsFromValue(value))
  const [localError, setLocalError] = useState<string | undefined>()

  useEffect(() => {
    setParts(partsFromValue(value))
    if (!value) setLocalError(undefined)
  }, [value?.value, value?.calendar, value?.leapMonth])

  const lunar = parts.calendar === 'lunar'
  const yearNum = Number(parts.year) || 0
  const lunarMonths = useMemo(
    () => (lunar && yearNum ? listLunarMonthsForYear(yearNum) : []),
    [lunar, yearNum],
  )
  const monthMeta = lunar ? parseLunarMonthKey(parts.month) : undefined
  const lunarDays = useMemo(() => {
    if (!lunar || !yearNum || !monthMeta) return []
    return lunarDayOptionsForMonth(yearNum, monthMeta.month, monthMeta.leap)
  }, [lunar, yearNum, parts.month, monthMeta?.month, monthMeta?.leap])

  const commit = (next: LocalParts) => {
    // Clamp day when month/year change shrinks the month.
    let adjusted = next
    if (next.calendar === 'lunar' && next.year && next.month) {
      const meta = parseLunarMonthKey(next.month)
      if (meta) {
        const days = lunarDayOptionsForMonth(Number(next.year), meta.month, meta.leap)
        if (next.day && !days.some((option) => option.value === next.day)) {
          adjusted = { ...next, day: '' }
        }
      }
    }
    setParts(adjusted)
    if (isComplete(adjusted)) {
      setLocalError(undefined)
      onChange(toRecord(adjusted))
      return
    }
    if (value) onChange(undefined)
    if (adjusted.year || adjusted.month || adjusted.day) {
      setLocalError(optional ? '日期未填完整时不会保存（可留空）' : '请选择完整的年、月、日')
    } else {
      setLocalError(undefined)
    }
  }

  const switchCalendar = (calendar: Calendar) => {
    if (parts.calendar === calendar) return
    const hasFilled = Boolean(parts.year || parts.month || parts.day || value?.value)
    if (hasFilled) {
      const ok = window.confirm(
        '当前版本无法在阴历与阳历之间自动换算。切换历法将清空已填写的日期，是否继续？',
      )
      if (!ok) return
      const cleared: LocalParts = { year: '', month: '', day: '', calendar }
      setParts(cleared)
      setLocalError(undefined)
      onChange(undefined)
      return
    }
    setParts({ year: '', month: '', day: '', calendar })
  }

  const fieldError = error ?? localError
  const preview = isComplete(parts)
    ? (lunar
      ? formatLunarDateChinese(
        `${parts.year}-${String(monthMeta?.month ?? '').padStart(2, '0')}-${parts.day}`,
        { prefix: false, leapMonth: monthMeta?.leap },
      )
      : `${parts.year}-${parts.month}-${parts.day}`)
    : undefined

  return (
    <div className="date-picker">
      <div className="field-label-row">
        <span className="field-label">{label}</span>
        {optional && <span className="field-hint">可选</span>}
      </div>
      <div className="calendar-switch" role="group" aria-label="历法">
        <button type="button" className={!lunar ? 'active' : ''} onClick={() => switchCalendar('solar')}>
          阳历
        </button>
        <button type="button" className={lunar ? 'active' : ''} onClick={() => switchCalendar('lunar')}>
          农历
        </button>
      </div>
      <div className="date-selects">
        <select
          aria-label={`${label}年`}
          value={parts.year}
          onChange={(event) => commit({ ...parts, year: event.target.value, month: '', day: '' })}
        >
          <option value="">年</option>
          {YEARS.map((year) => (
            <option key={year} value={year}>
              {lunar ? lunarYearLabel(year) : year}
            </option>
          ))}
        </select>
        <select
          aria-label={`${label}月`}
          value={parts.month}
          onChange={(event) => commit({ ...parts, month: event.target.value, day: '' })}
          disabled={lunar && !parts.year}
        >
          <option value="">月</option>
          {lunar
            ? lunarMonths.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))
            : SOLAR_MONTHS.map((month) => (
                <option key={month} value={month}>{Number(month)}月</option>
              ))}
        </select>
        <select
          aria-label={`${label}日`}
          value={parts.day}
          onChange={(event) => commit({ ...parts, day: event.target.value })}
          disabled={lunar && (!parts.year || !parts.month)}
        >
          <option value="">日</option>
          {lunar
            ? lunarDays.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))
            : SOLAR_DAYS.map((day) => (
                <option key={day} value={day}>{Number(day)}日</option>
              ))}
        </select>
      </div>
      {preview && <p className="date-preview" aria-live="polite">{preview}</p>}
      {fieldError && <p className="field-error" role="alert">{fieldError}</p>}
    </div>
  )
}
