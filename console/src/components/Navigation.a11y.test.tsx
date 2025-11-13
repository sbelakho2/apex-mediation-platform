import React from 'react'
import { render } from '@testing-library/react'
import { axe } from 'jest-axe'
import Navigation from './Navigation'

jest.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
}))

jest.mock('@/lib/useSession', () => ({
  useSession: () => ({
    user: { email: 'demo@example.com', role: 'publisher' },
    isLoading: false,
    error: null,
    refetch: jest.fn(),
    logout: { mutate: jest.fn() },
  }),
}))

jest.mock('@/lib/useFeatures', () => ({
  useFeatures: () => ({
    features: { transparency: true, billing: true, migrationStudio: true },
    loading: false,
    error: null,
  }),
}))

describe('Navigation component — accessibility', () => {
  it('has no detectable a11y violations', async () => {
    const { container } = render(
      <Navigation>
        <main>Content</main>
      </Navigation>
    )
    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })
})
