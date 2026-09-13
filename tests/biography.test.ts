import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import { addPerson, createEmptyFamilyTree, searchPersons, updatePerson } from '../src/domain'
import { createFamilyTreeWorkbook, parseFamilyTreeJson, parseFamilyTreeWorkbook, stringifyFamilyTree } from '../src/io'
import { fourGenerationTree } from '../src/fixtures'

describe('person biography', () => {
  it('persists an optional biography and includes it in person search', () => {
    let tree = createEmptyFamilyTree('个人简介')
    tree = addPerson(tree, {
      name: '盛简介',
      gender: 'male',
      isDeceased: false,
      biography: '喜欢修桥铺路，常年整理地方文献。',
    })
    expect(searchPersons(tree, '地方文献').map((person) => person.name)).toEqual(['盛简介'])

    tree = updatePerson(tree, tree.persons[0].id, { biography: undefined })
    expect(searchPersons(tree, '地方文献')).toHaveLength(0)
  })

  it('round-trips biography through JSON exports and rejects malformed biography imports', () => {
    const tree = {
      ...fourGenerationTree,
      persons: fourGenerationTree.persons.map((person, index) =>
        index === 0 ? { ...person, biography: '家族迁徙故事的主要讲述者。' } : person,
      ),
    }
    const imported = parseFamilyTreeJson(stringifyFamilyTree(tree))
    expect(imported.persons[0].biography).toBe('家族迁徙故事的主要讲述者。')

    const malformed = {
      ...tree,
      persons: tree.persons.map((person, index) =>
        index === 0 ? { ...person, biography: { text: 'bad' } } : person,
      ),
    }
    expect(() => parseFamilyTreeJson(JSON.stringify(malformed))).toThrow(/biography.*字符串/)
  })

  it('round-trips biography through the Excel maintenance workbook', async () => {
    const tree = {
      ...fourGenerationTree,
      persons: fourGenerationTree.persons.map((person, index) =>
        index === 0 ? { ...person, biography: '擅长族谱整理，待人温和。' } : person,
      ),
    }
    const imported = await parseFamilyTreeWorkbook(await createFamilyTreeWorkbook(tree))
    expect(imported.persons[0].biography).toBe('擅长族谱整理，待人温和。')

    const workbook = XLSX.read(await createFamilyTreeWorkbook(fourGenerationTree), { type: 'array' })
    XLSX.utils.sheet_add_aoa(
      workbook.Sheets.人物,
      [['excel-bio', '盛新传', '', '男', '否', '', '', '未知', '', '', '', '', '未知', '', '', '', '', '教师', '三句话认识这个人。', '由 Excel 补录经历']],
      { origin: -1 },
    )
    const changed = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer
    expect((await parseFamilyTreeWorkbook(changed)).persons.find((person) => person.id === 'excel-bio')).toMatchObject({
      biography: '三句话认识这个人。',
      notes: '由 Excel 补录经历',
    })
  })
})
