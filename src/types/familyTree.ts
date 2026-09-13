export type Gender = 'male' | 'female' | 'unknown'
export type DatePrecision = 'exact' | 'month' | 'year' | 'approximate' | 'unknown'
export type Calendar = 'solar' | 'lunar' | 'unknown'

export interface DateRecord {
  value?: string
  calendar?: Calendar
  precision: DatePrecision
  originalText?: string
  /** When calendar is lunar, marks a leap month (闰月) for the month in value. */
  leapMonth?: boolean
}

export interface Person {
  id: string
  name: string
  formerNames?: string[]
  gender: Gender
  generation?: number
  generationName?: string
  rank?: string
  isDeceased: boolean
  birth?: DateRecord
  death?: DateRecord
  ancestralHome?: string
  birthplace?: string
  occupation?: string
  biography?: string
  notes?: string
  createdAt: string
  updatedAt: string
}

export type ParentRole = 'father' | 'mother' | 'unknown'
export type ParentChildType = 'biological' | 'adopted' | 'step' | 'guoji' | 'unknown'
export interface ParentChildRelationship {
  id: string
  parentId: string
  childId: string
  parentRole: ParentRole
  relationshipType: ParentChildType
  notes?: string
  createdAt: string
  updatedAt: string
}

export type PartnerType = 'married' | 'partner' | 'former_spouse' | 'unknown'
export interface PartnerRelationship {
  id: string
  person1Id: string
  person2Id: string
  relationshipType: PartnerType
  startDate?: DateRecord
  endDate?: DateRecord
  notes?: string
  createdAt: string
  updatedAt: string
}

export interface FamilyTree {
  id: string
  name: string
  surname?: string
  description?: string
  rootPersonId?: string
  persons: Person[]
  parentChildRelationships: ParentChildRelationship[]
  partnerRelationships: PartnerRelationship[]
  schemaVersion: '1.0.0'
  createdAt: string
  updatedAt: string
}

export type CreatePersonInput = Omit<Person, 'id' | 'createdAt' | 'updatedAt'>
export type UpdatePersonInput = Partial<Omit<Person, 'id' | 'createdAt' | 'updatedAt'>>
export type CreateParentChildInput = Omit<ParentChildRelationship, 'id' | 'createdAt' | 'updatedAt'>
export type CreatePartnerInput = Omit<PartnerRelationship, 'id' | 'createdAt' | 'updatedAt'>

export interface DeletionImpact {
  person: Person
  parentChildRelationships: ParentChildRelationship[]
  partnerRelationships: PartnerRelationship[]
}

export const CURRENT_SCHEMA_VERSION = '1.0.0' as const
