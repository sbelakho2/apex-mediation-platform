export type Role = 'admin' | 'publisher' | 'readonly'

export class RbacError extends Error {
  status: number
  reason: string

  constructor(message: string, reason: string) {
    super(message)
    this.name = 'RbacError'
    this.status = 403
    this.reason = reason
  }
}

export function hasRole(userRole: Role | null | undefined, allowed: Role[]): boolean {
  if (!userRole) return false
  return allowed.includes(userRole)
}

export function assertRole(userRole: Role | null | undefined, allowed: Role[], message?: string) {
  if (!hasRole(userRole, allowed)) {
    const reason = `requires-role:${allowed.join('|')}`
    throw new RbacError(message || 'Forbidden', reason)
  }
}
