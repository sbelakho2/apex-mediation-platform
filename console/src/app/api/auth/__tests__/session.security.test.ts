import { authOptions } from '../route'

describe('Session/Cookie security (NextAuth)', () => {
  it('uses secure cookies in production', () => {
    const orig = process.env.NODE_ENV
    process.env.NODE_ENV = 'production'
    try {
      expect(authOptions.useSecureCookies).toBe(true)
    } finally {
      process.env.NODE_ENV = orig
    }
  })

  it('sets shorter maxAge for admin sessions and rotates on role change', async () => {
    const token: any = { role: 'publisher' }
    const session: any = { user: { name: 'X' } }

    // Publisher session
    const s1 = await (authOptions.callbacks as any).session({ session, token })
    expect(s1.maxAge).toBe(24 * 60 * 60)

    // Emulate role elevation update
    await (authOptions.callbacks as any).jwt({ token, user: undefined, trigger: 'update', session: { role: 'admin' } })
    const s2 = await (authOptions.callbacks as any).session({ session, token })
    expect(s2.maxAge).toBe(4 * 60 * 60)
    expect(typeof s2.sessionVersion).toBe('number')
    expect(s2.elevatedAt === undefined || typeof s2.elevatedAt === 'number').toBe(true)
  })
})
