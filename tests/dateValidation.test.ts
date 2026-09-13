import { describe, expect, it } from 'vitest'
import { addPerson, updatePerson } from '../src/domain'
import { fourGenerationTree } from '../src/fixtures'
import { parseFamilyTreeJson } from '../src/io'
import type { FamilyTree } from '../src/types'
import { validateDateRecord, validatePartnerDates, validatePersonDates, validateFamilyTree } from '../src/validation'

describe('selected family dates', () => {
  it('accepts full solar and lunar dates without converting the saved value', () => {
    const solar = { value: '1954-06-12', calendar: 'solar' as const, precision: 'exact' as const }
    const lunar = { value: '1954-05-11', calendar: 'lunar' as const, precision: 'exact' as const }
    expect(validateDateRecord(solar)).toEqual([])
    expect(validateDateRecord(lunar)).toEqual([])
    expect(lunar.value).toBe('1954-05-11')
  })

  it('requires complete selected dates and validates solar and lunar bounds', () => {
    expect(validateDateRecord({ value: '1954-06', calendar: 'solar', precision: 'exact' })).toContain('日期需选择完整的年月日')
    expect(validateDateRecord({ value: '1954-02-30', calendar: 'solar', precision: 'exact' })).toContain('日期不是有效日期')
    expect(validateDateRecord({ value: '1954-13-01', calendar: 'lunar', precision: 'exact' })[0]).toMatch(/不是有效农历日期/)
    expect(validateDateRecord({ value: '1954-12-31', calendar: 'lunar', precision: 'exact' })[0]).toMatch(/不是有效农历日期/)
  })

  it('only compares birth and death dates in the same calendar', () => {
    expect(validatePersonDates({ isDeceased: true, birth: { value: '1954-05-11', calendar: 'lunar', precision: 'exact' }, death: { value: '1954-05-10', calendar: 'lunar', precision: 'exact' } })).toContain('去世日期不能早于出生日期')
    expect(validatePersonDates({ isDeceased: true, birth: { value: '1954-05-11', calendar: 'lunar', precision: 'exact' }, death: { value: '1954-05-10', calendar: 'solar', precision: 'exact' } })).toEqual([])
    expect(validatePersonDates({ isDeceased: false, death: { value: '1954-05-10', calendar: 'solar', precision: 'exact' } })).toContain('在世人物不能填写明确的去世日期')
  })

  it('validates partner date bounds and chronological order', () => {
    expect(validatePartnerDates({
      startDate: { value: '1954-02-30', calendar: 'solar', precision: 'exact' },
    })).toContain('开始日期不是有效日期')
    expect(validatePartnerDates({
      startDate: { value: '1960-05-11', calendar: 'solar', precision: 'exact' },
      endDate: { value: '1959-05-11', calendar: 'solar', precision: 'exact' },
    })).toContain('结束日期不能早于开始日期')

    const invalidTree: FamilyTree = {
      ...fourGenerationTree,
      partnerRelationships: fourGenerationTree.partnerRelationships.map((relationship, index) => index === 0
        ? { ...relationship, startDate: { value: '1960-05-11', calendar: 'solar', precision: 'exact' }, endDate: { value: '1959-05-11', calendar: 'solar', precision: 'exact' } }
        : relationship),
    }
    expect(validateFamilyTree(invalidTree).join('；')).toMatch(/结束日期不能早于开始日期/)
  })
})

describe('write-time gender validation', () => {
  it('rejects unknown on new people but permits legacy unknown records to be read and imported', () => {
    expect(() => addPerson(fourGenerationTree, { name: '待补充', gender: 'unknown', isDeceased: false })).toThrow('请选择男性或女性')
    const legacy: FamilyTree = { ...fourGenerationTree, persons: [...fourGenerationTree.persons, { ...fourGenerationTree.persons[0], id: 'legacy-unknown', gender: 'unknown' }] }
    expect(parseFamilyTreeJson(JSON.stringify(legacy)).persons.find((person) => person.id === 'legacy-unknown')?.gender).toBe('unknown')
  })

  it('requires a legacy unknown person to choose a binary gender when edited', () => {
    const legacy: FamilyTree = { ...fourGenerationTree, persons: [...fourGenerationTree.persons, { ...fourGenerationTree.persons[0], id: 'legacy-unknown', gender: 'unknown' }] }
    expect(() => updatePerson(legacy, 'legacy-unknown', { notes: '已核对' })).toThrow('请选择男性或女性')
    expect(updatePerson(legacy, 'legacy-unknown', { gender: 'female', notes: '已核对' }).persons.find((person) => person.id === 'legacy-unknown')?.gender).toBe('female')
  })
})
