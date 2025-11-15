import React from 'react'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import Page from './page'

// Mock clipboard API
Object.assign(navigator, {
  clipboard: {
    writeText: jest.fn(() => Promise.resolve()),
  },
})

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

// Mock next/link
jest.mock('next/link', () => {
  const MockLink = ({ children, href, ...props }: any) => (
    <a href={href} {...props}>
      {children}
    </a>
  )
  MockLink.displayName = 'MockNextLink'
  return MockLink
})

describe('Transparency Auction Detail Page', () => {
  const mockAuction = {
    auction_id: 'auc-123',
    timestamp: new Date('2025-11-10T12:00:00.000Z').toISOString(),
    publisher_id: 'pub-1',
    app_or_site_id: 'app-1',
    placement_id: 'pl-456',
    surface_type: 'mobile_app',
    device_context: { os: 'ios', geo: 'US', att: 'authorized', tc_string_sha256: '0'.repeat(64) },
    candidates: [
      { source: 'alpha', bid_ecpm: 1.23, currency: 'USD', response_time_ms: 12, status: 'bid', metadata_hash: 'm1' },
      { source: 'beta', bid_ecpm: 0.98, currency: 'USD', response_time_ms: 18, status: 'no_bid', metadata_hash: 'm2' },
    ],
    winner: { source: 'alpha', bid_ecpm: 1.23, gross_price: 1.11, currency: 'USD', reason: 'highest_bid' },
    fees: { aletheia_fee_bp: 150, effective_publisher_share: 0.985 },
    integrity: { signature: 'test-signature-12345', algo: 'ed25519', key_id: 'key-2025-11-10-v1' },
  }

  const mockVerifyPass = {
    status: 'pass' as const,
    key_id: 'key-2025-11-10-v1',
    algo: 'ed25519',
    canonical: '{"auction_id":"auc-123","timestamp":"2025-11-10T12:00:00.000Z"}',
    sample_bps: 250,
  }

  beforeEach(() => {
    jest.clearAllMocks()
    mockTransparencyApi.get.mockResolvedValue(mockAuction)
    mockTransparencyApi.verify.mockResolvedValue(mockVerifyPass)
  })

  it('renders page header with back link', async () => {
    render(<Page params={{ auction_id: 'auc-123' }} />)
    
    await waitFor(() => {
      expect(screen.getByText('Auction Detail')).toBeInTheDocument()
    })
    
    expect(screen.getByText('Back to Auctions')).toBeInTheDocument()
  })

  it('shows skeleton loader while loading', () => {
    mockTransparencyApi.get.mockImplementation(() => new Promise(() => {}))
    render(<Page params={{ auction_id: 'auc-123' }} />)
    
    // Should show skeleton elements
    expect(screen.getByText('Auction Detail')).toBeInTheDocument()
  })

  it('renders auction overview section', async () => {
    render(<Page params={{ auction_id: 'auc-123' }} />)
    
    await waitFor(() => {
      expect(screen.getByText('Auction Overview')).toBeInTheDocument()
      expect(screen.getByText('auc-123')).toBeInTheDocument()
      expect(screen.getByText('pl-456')).toBeInTheDocument()
    })
  })

  it('renders cryptographic verification section', async () => {
    render(<Page params={{ auction_id: 'auc-123' }} />)
    
    await waitFor(() => {
      expect(screen.getByText('Cryptographic Verification')).toBeInTheDocument()
      expect(screen.getByText('key-2025-11-10-v1')).toBeInTheDocument()
      expect(screen.getByText('ed25519')).toBeInTheDocument()
      expect(screen.getByText(/test-signature-12345/)).toBeInTheDocument()
    })
  })

  it('shows PASS verification badge', async () => {
    render(<Page params={{ auction_id: 'auc-123' }} />)
    
    await waitFor(() => {
      expect(screen.getByText('PASS')).toBeInTheDocument()
    })
  })

  it('shows canonical payload in expandable details', async () => {
    render(<Page params={{ auction_id: 'auc-123' }} />)
    
    await waitFor(() => {
      expect(screen.getByText('View Canonical Payload')).toBeInTheDocument()
    })
    
    // Expand details
    const summary = screen.getByText('View Canonical Payload')
    fireEvent.click(summary)
    
    await waitFor(() => {
      expect(screen.getByText(/"auction_id"/)).toBeInTheDocument()
    })
  })

  it('renders bid candidates table', async () => {
    render(<Page params={{ auction_id: 'auc-123' }} />)
    
    await waitFor(() => {
      expect(screen.getByText('Bid Candidates')).toBeInTheDocument()
      expect(screen.getByText('alpha')).toBeInTheDocument()
      expect(screen.getByText('beta')).toBeInTheDocument()
    })
  })

  it('shows candidate status badges', async () => {
    render(<Page params={{ auction_id: 'auc-123' }} />)
    
    await waitFor(() => {
      const badges = screen.getAllByText(/bid|no_bid/)
      expect(badges.length).toBeGreaterThan(0)
    })
  })

  it('displays response times', async () => {
    render(<Page params={{ auction_id: 'auc-123' }} />)
    
    await waitFor(() => {
      expect(screen.getByText('12ms')).toBeInTheDocument()
      expect(screen.getByText('18ms')).toBeInTheDocument()
    })
  })

  it('has copy buttons for important fields', async () => {
    render(<Page params={{ auction_id: 'auc-123' }} />)
    
    await waitFor(() => {
      const copyButtons = screen.getAllByRole('button', { name: /copy to clipboard/i })
      expect(copyButtons.length).toBeGreaterThanOrEqual(4) // auction_id, placement_id, key_id, signature
    })
  })

  it('shows error state on API failure', async () => {
    mockTransparencyApi.get.mockRejectedValue(new Error('Network error'))
    
    render(<Page params={{ auction_id: 'auc-123' }} />)
    
    await waitFor(() => {
      expect(screen.getByText(/failed to load auction/i)).toBeInTheDocument()
      expect(screen.getByText(/network error/i)).toBeInTheDocument()
    })
  })

  it('handles unsigned auctions gracefully', async () => {
    const unsignedAuction = { ...mockAuction, integrity: undefined }
    mockTransparencyApi.get.mockResolvedValue(unsignedAuction)
    
    render(<Page params={{ auction_id: 'auc-123' }} />)
    
    await waitFor(() => {
      expect(screen.getByText(/this auction was not signed/i)).toBeInTheDocument()
    })
  })
})
