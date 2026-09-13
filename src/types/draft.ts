import type { DateRecord, Gender } from './familyTree'

export type RelationKind = 'standalone' | 'father' | 'mother' | 'child' | 'spouse'

export interface PersonDraft {
  name: string
  gender: Gender
  birth?: DateRecord
  death?: DateRecord
  deceased: boolean
  /** Free-text 籍贯地址 — no structured picker. */
  ancestralHome: string
  /** Optional free-text occupation. */
  occupation: string
  /** Short personal introduction for the detail reading panel. */
  biography: string
  notes: string
}

export const blankPersonDraft = (): PersonDraft => ({
  name: '',
  gender: 'male',
  deceased: false,
  ancestralHome: '',
  occupation: '',
  biography: '',
  notes: '',
})
