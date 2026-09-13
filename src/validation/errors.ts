export class FamilyTreeValidationError extends Error {
  constructor(public readonly issues: string[]) {
    super(issues.join('；'))
    this.name = 'FamilyTreeValidationError'
  }
}
