import type { Gender } from '../types'
import type { RelationKind } from '../types/draft'

/**
 * Default gender for a newly created relative.
 * Spouse defaults to the opposite sex (MVP assumes heterosexual couples).
 */
export function defaultGenderForRelation(
  kind: RelationKind,
  selectedGender?: Gender,
): Gender {
  if (kind === 'father') return 'male'
  if (kind === 'mother') return 'female'
  if (kind === 'spouse') {
    if (selectedGender === 'male') return 'female'
    if (selectedGender === 'female') return 'male'
    return 'female'
  }
  // child / first person — no strong default beyond male for empty draft history
  return 'male'
}
