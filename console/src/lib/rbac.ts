export type Role = 'admin' | 'publisher' | 'readonly'

export function hasRole(userRole: Role | undefined, allowed: Role[]): boolean {
  const role = userRole || 'publisher'
  return allowed.includes(role)
}

export function assertRole(userRole: Role | undefined, allowed: Role[]) {
  if (!hasRole(userRole, allowed)) {
    throw new Error('Forbidden')
  }
}
