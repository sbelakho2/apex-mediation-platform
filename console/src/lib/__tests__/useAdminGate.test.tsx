import { renderHook, waitFor } from '@testing-library/react'
import { useAdminGate } from '../useAdminGate'
import type { SessionUser } from '../useSession'

const mockIsFeatureEnabled = jest.fn((flag?: string) => true)

jest.mock('@/lib/featureFlags', () => ({
  isFeatureEnabled: (flag: string) => mockIsFeatureEnabled(flag),
}))

const mockRouterReplace = jest.fn()
let mockPathname = '/admin/health'

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: mockRouterReplace,
  }),
  usePathname: () => mockPathname,
}))

const mockUseSession = jest.fn()

jest.mock('../useSession', () => ({
  useSession: (options?: unknown) => mockUseSession(options),
}))

const buildSession = (overrides: Partial<{ user: SessionUser | null; isLoading: boolean }> = {}) => ({
  user: null,
  isLoading: false,
  ...overrides,
})

describe('useAdminGate', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockPathname = '/admin/health'
    mockUseSession.mockReturnValue(buildSession())
    window.history.replaceState({}, 'Test', mockPathname)
    mockIsFeatureEnabled.mockImplementation(() => true)
  })

  it('redirects unauthenticated users to login once', async () => {
    mockUseSession.mockReturnValue(buildSession({ user: null, isLoading: false }))

    renderHook(() => useAdminGate())

    await waitFor(() => {
      expect(mockRouterReplace).toHaveBeenCalledTimes(1)
      expect(mockRouterReplace.mock.calls[0][0]).toMatch(/\/login\?next=/)
    })

    mockRouterReplace.mockClear()

    await waitFor(() => {
      expect(mockRouterReplace).not.toHaveBeenCalled()
    })
  })

  it('redirects non-admin users to 403', async () => {
    mockUseSession.mockReturnValue(
      buildSession({
        user: {
          userId: '1',
          publisherId: 'pub',
          email: 'user@test.dev',
          role: 'publisher',
        },
      })
    )

    renderHook(() => useAdminGate())

    await waitFor(() => {
      expect(mockRouterReplace).toHaveBeenCalledWith('/403')
    })
  })

  it('does not redirect admins and returns gate status', async () => {
    const adminUser: SessionUser = {
      userId: 'admin',
      publisherId: 'pub',
      email: 'admin@test.dev',
      role: 'admin',
    }
    mockUseSession.mockReturnValue(buildSession({ user: adminUser }))

    const { result } = renderHook(() => useAdminGate())

    await waitFor(() => {
      expect(result.current.isAdmin).toBe(true)
      expect(result.current.user).toEqual(adminUser)
    })

    expect(mockRouterReplace).not.toHaveBeenCalled()
  })

  it('can disable redirects for custom handling', async () => {
    mockUseSession.mockReturnValue(buildSession({ user: null, isLoading: false }))

    renderHook(() => useAdminGate({ disableRedirects: true }))

    await waitFor(() => {
      expect(mockRouterReplace).not.toHaveBeenCalled()
    })
  })

  it('respects the requireAdminGuard flag when disabled', async () => {
    mockIsFeatureEnabled.mockImplementation(() => false)
    mockUseSession.mockReturnValue(buildSession({ user: null, isLoading: false }))

    renderHook(() => useAdminGate())

    await waitFor(() => {
      expect(mockRouterReplace).not.toHaveBeenCalled()
    })
  })
})
