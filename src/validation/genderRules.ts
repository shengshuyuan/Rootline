import type { Gender } from '../types'
import { isGender } from './enums'

/**
 * `unknown` remains readable for records created by older releases, but is not
 * a valid value for a person form submission.
 */
export function validateWritableGender(gender: Gender): string[] {
  if (!isGender(gender)) return ['性别无效']
  return gender === 'male' || gender === 'female' ? [] : ['请选择男性或女性']
}
