import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import { createFamilyTreeTemplateWorkbook, createFamilyTreeWorkbook, FAMILY_TREE_TEMPLATE_NAME, parseFamilyTreeWorkbook } from '../src/io'
import { fourGenerationTree } from '../src/fixtures'

describe('Excel family-tree maintenance workbook', () => {
  it('round-trips people, family metadata, dates, and relationships', async () => {
    const imported = await parseFamilyTreeWorkbook(await createFamilyTreeWorkbook(fourGenerationTree))
    expect(imported.name).toBe(fourGenerationTree.name)
    expect(imported.surname).toBe(fourGenerationTree.surname)
    expect(imported.rootPersonId).toBe(fourGenerationTree.rootPersonId)
    expect(imported.persons).toHaveLength(fourGenerationTree.persons.length)
    expect(imported.parentChildRelationships).toHaveLength(fourGenerationTree.parentChildRelationships.length)
    expect(imported.partnerRelationships).toHaveLength(fourGenerationTree.partnerRelationships.length)
    expect(imported.persons.find((person) => person.id === 'p9')?.birth).toEqual(fourGenerationTree.persons.find((person) => person.id === 'p9')?.birth)
    expect(imported.persons.find((person) => person.id === 'p9')?.biography).toBe(fourGenerationTree.persons.find((person) => person.id === 'p9')?.biography)
  })

  it('accepts user-facing Chinese values when a maintainer adds a person', async () => {
    const data = await createFamilyTreeWorkbook(fourGenerationTree)
    const workbook = XLSX.read(data, { type: 'array' })
    const sheet = workbook.Sheets.人物
    XLSX.utils.sheet_add_aoa(sheet, [['excel-new', '盛新添', '', '女', '否', '2001-03-02', '公历', '精确', '', '否', '', '未知', '未知', '', '否', '湖南省衡阳市', '', '教师', '温和耐心，热心整理家庭照片。', '由 Excel 补录']], { origin: -1 })
    const changed = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer
    const imported = await parseFamilyTreeWorkbook(changed)
    expect(imported.persons.find((person) => person.id === 'excel-new')).toMatchObject({
      name: '盛新添', gender: 'female', ancestralHome: '湖南省衡阳市', occupation: '教师', biography: '温和耐心，热心整理家庭照片。', notes: '由 Excel 补录',
    })
  })

  it('builds a blank import template and ignores the example sheet', async () => {
    const data = await createFamilyTreeTemplateWorkbook()
    const workbook = XLSX.read(data, { type: 'array' })
    expect(workbook.SheetNames).toEqual(['族谱', '人物', '亲子关系', '配偶关系', '填写说明', '填写示例'])
    const imported = await parseFamilyTreeWorkbook(data)
    expect(imported.name).toBe(FAMILY_TREE_TEMPLATE_NAME)
    expect(imported.persons).toHaveLength(0)
    expect(imported.parentChildRelationships).toHaveLength(0)
    expect(imported.partnerRelationships).toHaveLength(0)
    const example = XLSX.utils.sheet_to_json<string[]>(workbook.Sheets.填写示例, { header: 1 })
    expect(JSON.stringify(example)).toContain('盛太祖')
    expect(JSON.stringify(example)).toContain('p1')
  })

  it('imports people added to a downloaded template', async () => {
    const data = await createFamilyTreeTemplateWorkbook()
    const workbook = XLSX.read(data, { type: 'array' })
    XLSX.utils.sheet_add_aoa(workbook.Sheets.人物, [['p1', '盛新添', '', '女', '否', '2001-03-02', '公历', '精确', '', '否', '', '未知', '未知', '', '否', '湖南省衡阳市', '', '教师', '温和耐心。', '由模板补录']], { origin: -1 })
    const changed = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer
    const imported = await parseFamilyTreeWorkbook(changed)
    expect(imported.persons).toHaveLength(1)
    expect(imported.persons[0]).toMatchObject({ id: 'p1', name: '盛新添', gender: 'female', occupation: '教师' })
  })

  it('refuses workbooks without the required relation sheets', async () => {
    const book = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['族谱名称'], ['测试']]), '族谱')
    const incomplete = XLSX.write(book, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer
    await expect(parseFamilyTreeWorkbook(incomplete)).rejects.toThrow(/人物/)
  })
})
