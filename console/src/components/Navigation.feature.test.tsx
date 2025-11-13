import React from 'react'
import { render, screen } from '@testing-library/react'
import Navigation from './Navigation'

const mockUsePathname = jest.fn()
jest.mock('next/navigation', () => ({
  usePathname: () => mockUsePathname(),
}))

jest.mock('next/link', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const React = require('react')
  return ({ href, children, ...props }: any) => React.createElement('a', { href, ...props }, children)
})

const mockUseSession = jest.fn()
jest.mock('@/lib/useSession', () => ({
  useSession: () => mockUseSession(),
}))

const mockUseFeatures = jest.fn()
jest.mock('@/lib/useFeatures', () => ({
  useFeatures: () => mockUseFeatures(),
}))

// Mock global fetch for feature flags in component runtime
beforeAll(() => {
  if (!global.fetch) {
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            data: { transparency: true, billing: true, migrationStudio: true },
          }),
      })
    ) as unknown as typeof fetch
  }
})

describe('Navigation feature flags', () => {
  beforeEach(() => {
    mockUsePathname.mockReturnValue('/dashboard')
    mockUseSession.mockReturnValue({ user: { email: 'demo@example.com', role: 'publisher' } })
    mockUseFeatures.mockReturnValue({ features: { migrationStudio: false }, loading: false, error: null })
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  it('shows Migration Studio link when feature is enabled', () => {
    mockUseFeatures.mockReturnValue({ features: { migrationStudio: true }, loading: false, error: null })
    render(
      <Navigation>
        <main>children</main>
      </Navigation>
    )

    expect(screen.getByRole('link', { name: /Migration Studio/i })).toBeInTheDocument()
  })

  it('hides Migration Studio link when feature is disabled', () => {
    render(
      <Navigation>
        <main>children</main>
      </Navigation>
    )

    expect(screen.queryByRole('link', { name: /Migration Studio/i })).not.toBeInTheDocument()
  })
})
