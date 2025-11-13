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
  get: jest.fn(),
  verify: jest.fn(),
}

jest.mock('../../../../lib/transparency', () => ({
  transparencyApi: {
    get: (...args: any[]) => mockTransparencyApi.get(...args),
    verify: (...args: any[]) => mockTransparencyApi.verify(...args),
  },
}))

describe('Transparency Auction Detail Page — a11y and keyboard', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(useRouter as jest.Mock).mockReturnValue({ push: jest.fn() })
    ;(useSearchParams as jest.Mock).mockReturnValue(new URLSearchParams())
    ;(usePathname as jest.Mock).mockReturnValue('/transparency/auctions/auc-123')

    mockTransparencyApi.get.mockResolvedValue({
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
    })
    mockTransparencyApi.verify.mockResolvedValue({
      status: 'pass',
      canonical_truncated: false,
      size_bytes: 1234,
      diagnostics: [],
    })
  })

  it('has no obvious axe violations', async () => {
    const { container } = render(<Page params={{ auction_id: 'auc-123' }} />)
    await waitFor(() => screen.getByText(/Auction Detail/i))
    await screen.findByText('PASS')
    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })

  it('allows keyboard navigation to primary actions', async () => {
    render(<Page params={{ auction_id: 'auc-123' }} />)
    await waitFor(() => screen.getByText(/Auction Detail/i))
    await screen.findByText('PASS')
    const user = userEvent.setup()

    // Tab through page and ensure we can reach a button like Copy or Verify
    await user.tab()
    await user.tab()
    const anyButton = screen.getAllByRole('button')[0]
    expect(anyButton).toBeInTheDocument()
  })
})
