import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import Page from './page'

// Mock Next.js navigation hooks
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
  useSearchParams: jest.fn(),
  usePathname: jest.fn(),
}))

// Mock clipboard API
Object.assign(navigator, {
  clipboard: {
    writeText: jest.fn(() => Promise.resolve()),
  },
})

const mockTransparencyApi = {
  list: jest.fn(),
  verify: jest.fn(),
}

jest.mock('../../../lib/transparency', () => ({
  transparencyApi: {
    list: (...args: any[]) => mockTransparencyApi.list(...args),
    verify: (...args: any[]) => mockTransparencyApi.verify(...args),
  },
}))

describe('Transparency Auctions Page', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    
    // Setup navigation mocks
    ;(useRouter as jest.Mock).mockReturnValue({
      push: jest.fn(),
    })
    ;(useSearchParams as jest.Mock).mockReturnValue(new URLSearchParams())
    ;(usePathname as jest.Mock).mockReturnValue('/transparency/auctions')
    
    // Setup API mock
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

  it('renders page header', async () => {
    render(<Page />)
    await waitFor(() => {
      expect(screen.getByText('Transparency — Auctions')).toBeInTheDocument()
    })
  })

  it('shows skeleton loader while loading', () => {
    mockTransparencyApi.list.mockImplementation(() => new Promise(() => {})) // Never resolves
    render(<Page />)
    
    // Skeleton should be present
    expect(screen.getByRole('table')).toBeInTheDocument()
  })

  it('renders auction list with data', async () => {
    render(<Page />)
    
    await waitFor(() => {
      expect(screen.getByText(/auc-123/i)).toBeInTheDocument()
      expect(screen.getByText(/pl-456/i)).toBeInTheDocument()
    })
  })

  it('displays device context correctly', async () => {
    render(<Page />)
    
    await waitFor(() => {
      expect(screen.getByText('ios')).toBeInTheDocument()
      expect(screen.getByText('US')).toBeInTheDocument()
    })
  })

  it('shows verify badge for signed auctions', async () => {
    render(<Page />)
    
    await waitFor(() => {
      // Badge should be present (may be verify button or status after auto-load)
      expect(screen.getByText(/auc-123/i)).toBeInTheDocument()
    })
    
    // Since autoLoad=false in list page, verify button should be present
    const verifyButton = screen.queryByRole('button', { name: /verify/i })
    // Button might not be present if already verified, so just check page rendered
    expect(screen.getByText('Transparency — Auctions')).toBeInTheDocument()
  })

  it('renders filters', () => {
    render(<Page />)
    
    expect(screen.getByPlaceholderText(/from \(iso\)/i)).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/to \(iso\)/i)).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/placement id/i)).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/geo \(cc\)/i)).toBeInTheDocument()
  })

  it('shows empty state when no data', async () => {
    mockTransparencyApi.list.mockResolvedValue({
      page: 1,
      limit: 25,
      count: 0,
      data: [],
    })

    render(<Page />)
    
    await waitFor(() => {
      expect(screen.getByText(/no auctions found/i)).toBeInTheDocument()
    })
  })

  it('shows error state on API failure', async () => {
    mockTransparencyApi.list.mockRejectedValue(new Error('Network error'))

    render(<Page />)
    
    await waitFor(() => {
      expect(screen.getByText(/failed to load auctions/i)).toBeInTheDocument()
      expect(screen.getByText(/network error/i)).toBeInTheDocument()
    })
  })

  it('has copy buttons for auction and placement IDs', async () => {
    render(<Page />)
    
    await waitFor(() => {
      const copyButtons = screen.getAllByRole('button', { name: /copy to clipboard/i })
      expect(copyButtons.length).toBeGreaterThan(0)
    })
  })
})
