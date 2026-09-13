import { FamilyTreeValidationError } from '../validation'

export type PersonFieldKey = 'name' | 'gender' | 'birth' | 'death' | 'ancestralHome' | 'notes'

export interface MappedFormErrors {
  fields: Partial<Record<PersonFieldKey, string>>
  /** Cross-cutting issues (cycles, second spouse, duplicate edges, …). */
  form: string[]
}

/** Split domain validation issues into field-level vs form-level messages. */
export function mapValidationIssues(issues: string[]): MappedFormErrors {
  const fields: MappedFormErrors['fields'] = {}
  const form: string[] = []
  issues.forEach((issue) => {
    if (/姓名|名字/.test(issue)) fields.name = fields.name ?? issue
    else if (/性别|男性|女性/.test(issue)) fields.gender = fields.gender ?? issue
    else if (/出生|生年|生日/.test(issue) && !/去世|死亡/.test(issue)) fields.birth = fields.birth ?? issue
    else if (/去世|死亡|逝世/.test(issue)) fields.death = fields.death ?? issue
    else if (/籍贯/.test(issue)) fields.ancestralHome = fields.ancestralHome ?? issue
    else form.push(issue)
  })
  return { fields, form }
}

export function issuesFromUnknown(error: unknown, fallback: string): string[] {
  if (error instanceof FamilyTreeValidationError) return error.issues.length ? error.issues : [error.message]
  if (error instanceof Error && error.message) return [error.message]
  return [fallback]
}
