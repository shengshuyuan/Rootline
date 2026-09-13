import type * as XLSX from 'xlsx'
import { nanoid } from 'nanoid'
import { CURRENT_SCHEMA_VERSION, type Calendar, type DatePrecision, type FamilyTree, type Gender, type ParentChildRelationship, type PartnerRelationship, type Person } from '../types'
import { FamilyTreeValidationError, validateFamilyTree } from '../validation'

const EXCEL_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
type XlsxModule = typeof import('xlsx')
let xlsxLoader: Promise<XlsxModule> | undefined
const loadXlsx = () => (xlsxLoader ??= import('xlsx'))
const asText = (value: unknown) => String(value ?? '').trim()
const yesNo = (value: boolean | undefined) => value ? '是' : '否'

const genderFrom = (value: unknown): Gender => ({ 男: 'male', male: 'male', 女: 'female', female: 'female', 未知: 'unknown', unknown: 'unknown' }[asText(value).toLowerCase()] ?? 'unknown') as Gender
const calendarFrom = (value: unknown): Calendar => ({ 公历: 'solar', solar: 'solar', 农历: 'lunar', lunar: 'lunar', 未知: 'unknown', unknown: 'unknown' }[asText(value).toLowerCase()] ?? 'unknown') as Calendar
const precisionFrom = (value: unknown): DatePrecision => ({ 精确: 'exact', exact: 'exact', 月: 'month', month: 'month', 年: 'year', year: 'year', 约: 'approximate', approximate: 'approximate', 未知: 'unknown', unknown: 'unknown' }[asText(value).toLowerCase()] ?? 'unknown') as DatePrecision
const parentRoleFrom = (value: unknown): ParentChildRelationship['parentRole'] => ({ 父亲: 'father', father: 'father', 母亲: 'mother', mother: 'mother', 未知: 'unknown', unknown: 'unknown' }[asText(value).toLowerCase()] ?? 'unknown') as ParentChildRelationship['parentRole']
const parentTypeFrom = (value: unknown): ParentChildRelationship['relationshipType'] => ({ 亲生: 'biological', biological: 'biological', 收养: 'adopted', adopted: 'adopted', 继亲: 'step', step: 'step', 过继: 'guoji', guoji: 'guoji', 未知: 'unknown', unknown: 'unknown' }[asText(value).toLowerCase()] ?? 'unknown') as ParentChildRelationship['relationshipType']
const partnerTypeFrom = (value: unknown): PartnerRelationship['relationshipType'] => ({ 婚姻: 'married', married: 'married', 伴侣: 'partner', partner: 'partner', 前配偶: 'former_spouse', former_spouse: 'former_spouse', 未知: 'unknown', unknown: 'unknown' }[asText(value).toLowerCase()] ?? 'unknown') as PartnerRelationship['relationshipType']
const yesFrom = (value: unknown) => ['是', 'true', '1', '已故', 'yes'].includes(asText(value).toLowerCase())

const genderTo = (value: Gender) => value === 'male' ? '男' : value === 'female' ? '女' : '未知'
const calendarTo = (value?: Calendar) => value === 'solar' ? '公历' : value === 'lunar' ? '农历' : value === 'unknown' ? '未知' : ''
const precisionTo = (value: DatePrecision) => ({ exact: '精确', month: '月', year: '年', approximate: '约', unknown: '未知' })[value]
const parentRoleTo = (value: ParentChildRelationship['parentRole']) => ({ father: '父亲', mother: '母亲', unknown: '未知' })[value]
const parentTypeTo = (value: ParentChildRelationship['relationshipType']) => ({ biological: '亲生', adopted: '收养', step: '继亲', guoji: '过继', unknown: '未知' })[value]
const partnerTypeTo = (value: PartnerRelationship['relationshipType']) => ({ married: '婚姻', partner: '伴侣', former_spouse: '前配偶', unknown: '未知' })[value]

export const FAMILY_TREE_TEMPLATE_NAME = '未命名族谱'
export const FAMILY_TREE_TEMPLATE_FILENAME = 'Rootline_族谱导入模板.xlsx'

const peopleHeaders = ['人物编号', '姓名', '曾用名（用、分隔）', '性别', '是否已故', '出生日期', '出生历法', '出生精度', '出生原文', '出生闰月', '去世日期', '去世历法', '去世精度', '去世原文', '去世闰月', '籍贯地址', '出生地', '职业', '个人简介', '人生主要经历']
const parentHeaders = ['关系编号', '父母编号', '子女编号', '父母角色', '关系类型', '说明']
const partnerHeaders = ['关系编号', '人物 A 编号', '人物 B 编号', '关系类型', '开始日期', '开始历法', '开始精度', '结束日期', '结束历法', '结束精度', '说明']
const guideRows = [
  ['填写说明'],
  ['1. 请保留“人物编号”，亲子关系和配偶关系通过编号连接；新增并需要建立关系的人物，请先自行填写一个不重复的编号。'],
  ['2. 性别可填：男、女、未知；是否已故、闰月可填：是、否。'],
  ['3. 历法可填：公历、农历、未知；精度可填：精确、年、月、约、未知。日期可写 1980-05-12、1980-05 或 1980。'],
  ['4. 亲子关系类型可填：亲生、收养、继亲、过继、未知；主脉仅计算已记录的“亲生”关系。'],
  ['5. 导入会先校验全部工作表；有任何错误时，不会覆盖浏览器中的现有族谱。'],
  ['6. 从零填写请使用导入页的“下载 Excel 模板”。“填写示例”表只作对照，导入时不会读取。'],
]

function dateFrom(row: Record<string, unknown>, prefix: '出生' | '去世' | '开始' | '结束') {
  const value = asText(row[`${prefix}日期`])
  if (!value) return undefined
  const calendar = asText(row[`${prefix}历法`])
  const leapMonth = asText(row[`${prefix}闰月`])
  return {
    value,
    calendar: calendar ? calendarFrom(calendar) : undefined,
    precision: precisionFrom(row[`${prefix}精度`]),
    originalText: asText(row[`${prefix}原文`]) || undefined,
    leapMonth: leapMonth ? yesFrom(leapMonth) : undefined,
  }
}

function dateCells(date?: Person['birth']) {
  return [date?.value ?? '', calendarTo(date?.calendar), precisionTo(date?.precision ?? 'unknown'), date?.originalText ?? '', date?.leapMonth === undefined ? '' : yesNo(date.leapMonth)]
}

function sheetFromRows(xlsx: XlsxModule, rows: unknown[][], widths: number[]) {
  const sheet = xlsx.utils.aoa_to_sheet(rows)
  sheet['!cols'] = widths.map((wch) => ({ wch }))
  sheet['!autofilter'] = { ref: `A1:${xlsx.utils.encode_col(Math.max(0, rows[0].length - 1))}${rows.length}` }
  return sheet
}

function exampleGuideSheet(xlsx: XlsxModule) {
  return sheetFromRows(xlsx, [
    ['填写示例（此表不会被导入，请把真实资料填到「人物」「亲子关系」「配偶关系」）'],
    ['人物编号必须唯一；亲子和配偶关系用人物编号互相关联。下面三行是一套最小家庭，可对照抄写后删除。'],
    [],
    ['人物表示例'],
    peopleHeaders,
    ['p1', '盛太祖', '', '男', '是', '1880', '公历', '年', '', '', '1950', '公历', '年', '', '', '湖南省衡阳市', '', '', '始祖示例，导入前请改成真实家人。', ''],
    ['p2', '李氏', '', '女', '是', '1884', '公历', '年', '', '', '1956', '公历', '年', '', '', '湖南省衡阳市', '', '', '', ''],
    ['p3', '盛长子', '', '男', '否', '1910-03', '公历', '月', '', '', '', '未知', '未知', '', '', '湖南省衡阳市', '', '务农', '', ''],
    [],
    ['亲子关系表示例'],
    parentHeaders,
    ['pc1', 'p1', 'p3', '父亲', '亲生', ''],
    ['pc2', 'p2', 'p3', '母亲', '亲生', ''],
    [],
    ['配偶关系表示例'],
    partnerHeaders,
    ['pr1', 'p1', 'p2', '婚姻', '1905', '公历', '年', '', '', '未知', ''],
  ], [44, 14, 22, 12, 12, 14, 10, 10, 18, 10, 14, 10, 10, 18, 10, 22, 22, 18, 44, 36])
}

function blankTemplateTree(): FamilyTree {
  const timestamp = new Date().toISOString()
  return {
    id: nanoid(),
    name: FAMILY_TREE_TEMPLATE_NAME,
    description: '请把族谱名称和姓氏改成你家的，再在「人物」表填写家人。',
    persons: [],
    parentChildRelationships: [],
    partnerRelationships: [],
    schemaVersion: CURRENT_SCHEMA_VERSION,
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

/** Creates a user-editable workbook whose exported IDs can be referenced safely by relation sheets. */
export async function createFamilyTreeWorkbook(tree: FamilyTree, options: { exampleSheet?: boolean } = {}): Promise<ArrayBuffer> {
  const xlsx = await loadXlsx()
  const book = xlsx.utils.book_new()
  const meta = sheetFromRows(xlsx, [
    ['族谱名称', '姓氏', '描述', '根人物编号'],
    [tree.name, tree.surname ?? '', tree.description ?? '', tree.rootPersonId ?? ''],
  ], [28, 14, 42, 24])
  const people = sheetFromRows(xlsx, [
    peopleHeaders,
    ...tree.persons.map((person) => [
      person.id, person.name, (person.formerNames ?? []).join('、'), genderTo(person.gender), yesNo(person.isDeceased),
      ...dateCells(person.birth), ...dateCells(person.death),
      person.ancestralHome ?? '', person.birthplace ?? '', person.occupation ?? '', person.biography ?? '', person.notes ?? '',
    ]),
  ], [22, 14, 20, 10, 10, 14, 10, 10, 18, 10, 14, 10, 10, 18, 10, 22, 22, 18, 36, 44])
  const parents = sheetFromRows(xlsx, [
    parentHeaders,
    ...tree.parentChildRelationships.map((relationship) => [
      relationship.id, relationship.parentId, relationship.childId, parentRoleTo(relationship.parentRole), parentTypeTo(relationship.relationshipType), relationship.notes ?? '',
    ]),
  ], [22, 22, 22, 12, 12, 36])
  const partners = sheetFromRows(xlsx, [
    partnerHeaders,
    ...tree.partnerRelationships.map((relationship) => [
      relationship.id, relationship.person1Id, relationship.person2Id, partnerTypeTo(relationship.relationshipType),
      relationship.startDate?.value ?? '', calendarTo(relationship.startDate?.calendar), precisionTo(relationship.startDate?.precision ?? 'unknown'),
      relationship.endDate?.value ?? '', calendarTo(relationship.endDate?.calendar), precisionTo(relationship.endDate?.precision ?? 'unknown'), relationship.notes ?? '',
    ]),
  ], [22, 22, 22, 12, 14, 10, 10, 14, 10, 10, 36])
  const guide = sheetFromRows(xlsx, guideRows, [120])
  ;[meta, people, parents, partners, guide].forEach((sheet) => { sheet['!freeze'] = { xSplit: 0, ySplit: 1 } })
  xlsx.utils.book_append_sheet(book, meta, '族谱')
  xlsx.utils.book_append_sheet(book, people, '人物')
  xlsx.utils.book_append_sheet(book, parents, '亲子关系')
  xlsx.utils.book_append_sheet(book, partners, '配偶关系')
  xlsx.utils.book_append_sheet(book, guide, '填写说明')
  if (options.exampleSheet) xlsx.utils.book_append_sheet(book, exampleGuideSheet(xlsx), '填写示例')
  return xlsx.write(book, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer
}

/** Empty maintenance workbook for first-time Excel entry. Example rows live on an ignored sheet. */
export function createFamilyTreeTemplateWorkbook() {
  return createFamilyTreeWorkbook(blankTemplateTree(), { exampleSheet: true })
}

function rowsOf(xlsx: XlsxModule, book: XLSX.WorkBook, sheetName: string): Record<string, unknown>[] {
  const sheet = book.Sheets[sheetName]
  if (!sheet) throw new FamilyTreeValidationError([`Excel 缺少“${sheetName}”工作表`])
  return xlsx.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '', raw: false })
}

/** Parses and validates an editable Rootline workbook before it can replace local data. */
export async function parseFamilyTreeWorkbook(data: ArrayBuffer): Promise<FamilyTree> {
  const xlsx = await loadXlsx()
  let book: XLSX.WorkBook
  try {
    book = xlsx.read(data, { type: 'array', cellDates: false })
  } catch {
    throw new FamilyTreeValidationError(['Excel 文件无法读取，请使用导入页下载的模板或本系统导出的维护表'])
  }
  return parseWorkbook(xlsx, book)
}

function parseWorkbook(xlsx: XlsxModule, book: XLSX.WorkBook): FamilyTree {
  const [metaRows, personRows, parentRows, partnerRows] = ['族谱', '人物', '亲子关系', '配偶关系'].map((name) => rowsOf(xlsx, book, name))
  const meta = metaRows[0]
  if (!meta) throw new FamilyTreeValidationError(['“族谱”工作表缺少第一行族谱信息'])
  const timestamp = new Date().toISOString()
  const persons: Person[] = personRows.filter((row) => asText(row.姓名) || asText(row.人物编号)).map((row) => ({
    id: asText(row.人物编号) || nanoid(),
    name: asText(row.姓名),
    formerNames: asText(row['曾用名（用、分隔）']).split(/[、,，]/).map((name) => name.trim()).filter(Boolean),
    gender: genderFrom(row.性别),
    isDeceased: yesFrom(row.是否已故),
    birth: dateFrom(row, '出生'),
    death: dateFrom(row, '去世'),
    ancestralHome: asText(row.籍贯地址) || undefined,
    birthplace: asText(row.出生地) || undefined,
    occupation: asText(row.职业) || undefined,
    biography: asText(row.个人简介) || undefined,
    notes: asText(row.人生主要经历) || undefined,
    createdAt: timestamp,
    updatedAt: timestamp,
  }))
  const parentChildRelationships: ParentChildRelationship[] = parentRows.filter((row) => asText(row.父母编号) || asText(row.子女编号)).map((row) => ({
    id: asText(row.关系编号) || nanoid(), parentId: asText(row.父母编号), childId: asText(row.子女编号),
    parentRole: parentRoleFrom(row.父母角色), relationshipType: parentTypeFrom(row.关系类型), notes: asText(row.说明) || undefined,
    createdAt: timestamp, updatedAt: timestamp,
  }))
  const partnerRelationships: PartnerRelationship[] = partnerRows.filter((row) => asText(row['人物 A 编号']) || asText(row['人物 B 编号'])).map((row) => ({
    id: asText(row.关系编号) || nanoid(), person1Id: asText(row['人物 A 编号']), person2Id: asText(row['人物 B 编号']),
    relationshipType: partnerTypeFrom(row.关系类型), startDate: dateFrom(row, '开始'), endDate: dateFrom(row, '结束'), notes: asText(row.说明) || undefined,
    createdAt: timestamp, updatedAt: timestamp,
  }))
  const tree: FamilyTree = {
    id: nanoid(), name: asText(meta.族谱名称), surname: asText(meta.姓氏) || undefined, description: asText(meta.描述) || undefined,
    rootPersonId: asText(meta.根人物编号) || undefined, persons, parentChildRelationships, partnerRelationships,
    schemaVersion: CURRENT_SCHEMA_VERSION, createdAt: timestamp, updatedAt: timestamp,
  }
  const issues = validateFamilyTree(tree)
  if (issues.length) throw new FamilyTreeValidationError(issues)
  return tree
}

function triggerSpreadsheetDownload(bytes: ArrayBuffer, filename: string) {
  const url = URL.createObjectURL(new Blob([bytes], { type: EXCEL_MIME }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000)
}

export async function downloadFamilyTreeWorkbook(tree: FamilyTree, filename: string) {
  triggerSpreadsheetDownload(await createFamilyTreeWorkbook(tree), filename)
}

export async function downloadFamilyTreeTemplate(filename = FAMILY_TREE_TEMPLATE_FILENAME) {
  triggerSpreadsheetDownload(await createFamilyTreeTemplateWorkbook(), filename)
}
