jest.mock('next-auth', () => ({
  __esModule: true,
  default: jest.fn(() => ({})),
}))

jest.mock('next-auth/providers/credentials', () => ({
  __esModule: true,
  default: jest.fn(() => ({ id: 'credentials', type: 'credentials' })),
}))

const ORIGINAL_NODE_ENV = process.env.NODE_ENV

const setNodeEnv = (value: string) => {
  Object.defineProperty(process.env, 'NODE_ENV', {
    value,
    configurable: true,
    writable: true,
  })
}

const loadAuthOptions = async () => {
  const mod = await import('../[...nextauth]/route')
  return mod.authOptions
}

describe('Session/Cookie security (NextAuth)', () => {
  afterEach(() => {
    jest.resetModules()
    setNodeEnv(ORIGINAL_NODE_ENV)
  })

  it('uses secure cookies in production', async () => {
    setNodeEnv('production')
    jest.resetModules()

    const authOptions = await loadAuthOptions()
    expect(authOptions.useSecureCookies).toBe(true)
  })

  it('sets shorter maxAge for admin sessions and rotates on role change', async () => {
    jest.resetModules()
    const authOptions = await loadAuthOptions()

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
