import type { FamilyTree, Gender, Person } from '../types'
import { CURRENT_SCHEMA_VERSION } from '../types'

const stamp = '2026-07-12T00:00:00.000Z'
const person = (id: string, name: string, gender: Gender, overrides: Partial<Person> = {}): Person => ({ id, name, gender, isDeceased: false, createdAt: stamp, updatedAt: stamp, ...overrides })
const parent = (id: string, parentId: string, childId: string) => ({ id, parentId, childId, parentRole: 'unknown' as const, relationshipType: 'biological' as const, createdAt: stamp, updatedAt: stamp })
const partner = (id: string, person1Id: string, person2Id: string) => ({ id, person1Id, person2Id, relationshipType: 'married' as const, createdAt: stamp, updatedAt: stamp })

/** Synthetic-only fixture: four generations, 20 people, duplicate names and mixed family shapes. */
export const fourGenerationTree: FamilyTree = {
  id: 'fixture-tree', name: '虚拟四代测试家谱', surname: '盛', rootPersonId: 'p9', schemaVersion: CURRENT_SCHEMA_VERSION, createdAt: stamp, updatedAt: stamp,
  persons: [
    person('p1', '盛德安', 'male', { isDeceased: true, birth: { value: '1900', precision: 'year' } }), person('p2', '周兰芳', 'female', { isDeceased: true }),
    person('p3', '盛德成', 'male'), person('p4', '李素琴', 'female'), person('p5', '盛德明', 'male'), person('p6', '陈秋月', 'female'),
    person('p7', '盛国华', 'male'), person('p8', '赵静', 'female'), person('p9', '盛国安', 'male', { birth: { value: '1954', precision: 'year' } }), person('p10', '王梅', 'female'),
    person('p11', '盛国安', 'male', { birth: { precision: 'unknown', originalText: '约五十年代' } }), person('p12', '孙敏', 'female'),
    person('p13', '盛文博', 'male'), person('p14', '盛文静', 'female'), person('p15', '张磊', 'male'), person('p16', '盛文清', 'female'),
    person('p17', '盛思远', 'male'), person('p18', '盛思涵', 'female'), person('p19', '盛雨桐', 'female'), person('p20', '盛远航', 'male', { isDeceased: true }),
  ],
  parentChildRelationships: [
    parent('pc1', 'p1', 'p3'), parent('pc2', 'p2', 'p3'), parent('pc3', 'p1', 'p5'), parent('pc4', 'p2', 'p5'),
    parent('pc5', 'p3', 'p7'), parent('pc6', 'p4', 'p7'), parent('pc7', 'p3', 'p9'), parent('pc8', 'p4', 'p9'),
    parent('pc9', 'p5', 'p11'), parent('pc10', 'p6', 'p11'), parent('pc11', 'p9', 'p13'), parent('pc12', 'p10', 'p13'),
    parent('pc13', 'p9', 'p14'), parent('pc14', 'p10', 'p14'), parent('pc15', 'p14', 'p19'), parent('pc16', 'p15', 'p19'),
    parent('pc17', 'p13', 'p17'), parent('pc18', 'p13', 'p18'), parent('pc19', 'p12', 'p20'),
  ],
  partnerRelationships: [partner('pr1', 'p1', 'p2'), partner('pr2', 'p3', 'p4'), partner('pr3', 'p5', 'p6'), partner('pr4', 'p9', 'p10'), partner('pr5', 'p11', 'p12'), partner('pr6', 'p14', 'p15')],
}
