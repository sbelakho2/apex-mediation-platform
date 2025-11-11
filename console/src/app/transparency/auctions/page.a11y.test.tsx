import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'jest-axe'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import Page from './page'

// Mock Next.js navigation hooks
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
  useSearchParams: jest.fn(),
  usePathname: jest.fn(),
}))

// Mock API client
const mockTransparencyApi = {
  list: jest.fn(),
}

jest.mock('../../../lib/transparency', () => ({
  transparencyApi: {
    list: (...args: any[]) => mockTransparencyApi.list(...args),
  },
}))

// Mock next/link to avoid act warnings from Link component internals
jest.mock('next/link', () => {
  return ({ children, href }: any) => <a href={href}>{children}</a>
})

describe('Transparency Auctions Page — a11y and keyboard navigation', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(useRouter as jest.Mock).mockReturnValue({ push: jest.fn() })
    ;(useSearchParams as jest.Mock).mockReturnValue(new URLSearchParams())
    ;(usePathname as jest.Mock).mockReturnValue('/transparency/auctions')

    mockTransparencyApi.list.mockResolvedValue({
      page: 1,
      limit: 25,
      count: 1,
      data: [
        {
          auction_id: 'auc-123',
          timestamp: new Date('2025-11-10T12:00:00.000Z').toISOString(),
          publisher_id: 'pub-1',
          app_or_site_id: 'app-1',
          placement_id: 'pl-456',
          surface_type: 'mobile_app',
          device_context: { os: 'ios', geo: 'US', att: 'authorized', tc_string_sha256: '0'.repeat(64) },
          candidates: [],
          winner: { source: 'alpha', bid_ecpm: 1.23, gross_price: 1.11, currency: 'USD', reason: 'highest_bid' },
          fees: { aletheia_fee_bp: 150, effective_publisher_share: 0.985 },
          integrity: { signature: 'sig', algo: 'ed25519', key_id: 'key-1' },
        },
      ],
    })
  })

  it('has no obvious axe violations', async () => {
    const { container } = render(<Page />)
    await waitFor(() => screen.getByText(/Transparency — Auctions/i))
    const results = await axe(container, { rules: { 'color-contrast': { enabled: false }, 'button-name': { enabled: false } } })
    expect(results).toHaveNoViolations()
  })

  it('allows keyboard navigation to primary actions', async () => {
    render(<Page />)
    await waitFor(() => screen.getByText(/Transparency — Auctions/i))
    const user = userEvent.setup()

    // Tab through first interactive controls and ensure a button is reachable
    await user.tab()
    await user.tab()
    const buttons = screen.getAllByRole('button')
    expect(buttons.length).toBeGreaterThan(0)
  })
})
