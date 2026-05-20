export const PASSWORD_MIN_LENGTH = 8
export const PASSWORD_SPECIAL_CHARS = '!@#$%^&*'

export interface PasswordRule {
  id: 'length' | 'uppercase' | 'lowercase' | 'number' | 'special'
  label: string
  test: (password: string) => boolean
}

export const PASSWORD_RULES: readonly PasswordRule[] = [
  {
    id: 'length',
    label: `At least ${PASSWORD_MIN_LENGTH} characters`,
    test: (p) => p.length >= PASSWORD_MIN_LENGTH,
  },
  {
    id: 'uppercase',
    label: 'At least one uppercase letter',
    test: (p) => /[A-Z]/.test(p),
  },
  {
    id: 'lowercase',
    label: 'At least one lowercase letter',
    test: (p) => /[a-z]/.test(p),
  },
  {
    id: 'number',
    label: 'At least one number',
    test: (p) => /[0-9]/.test(p),
  },
  {
    id: 'special',
    label: `At least one special character (${PASSWORD_SPECIAL_CHARS})`,
    test: (p) => /[!@#$%^&*]/.test(p),
  },
]

export interface PasswordValidationResult {
  valid: boolean
  failed: PasswordRule['id'][]
  message: string | null
}

export function validatePassword(password: string): PasswordValidationResult {
  const failed = PASSWORD_RULES.filter((r) => !r.test(password)).map((r) => r.id)
  if (failed.length === 0) {
    return { valid: true, failed: [], message: null }
  }
  const failedLabels = PASSWORD_RULES.filter((r) => failed.includes(r.id)).map(
    (r) => r.label.toLowerCase()
  )
  return {
    valid: false,
    failed,
    message: `Password must include: ${failedLabels.join(', ')}.`,
  }
}
