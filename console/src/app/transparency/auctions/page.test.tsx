import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import Page from './page'

jest.mock('../../../lib/transparency', () => ({
  transparencyApi: {
    list: jest.fn(async () => ({
      page: 1,
      limit: 25,
      count: 1,
      data: [
        {
          auction_id: 'auc-1',
          timestamp: new Date('2025-01-01T00:00:00.000Z').toISOString(),
          publisher_id: 'pub-1',
          app_or_site_id: 'app-1',
          placement_id: 'pl-1',
          surface_type: 'mobile_app',
          device_context: { os: 'ios', geo: 'US', att: 'authorized', tc_string_sha256: '0'.repeat(64) },
          candidates: [],
          winner: { source: 'alpha', bid_ecpm: 1.23, gross_price: 1.11, currency: 'USD', reason: 'highest_bid' },
          fees: { aletheia_fee_bp: 150, effective_publisher_share: 0.985 },
          integrity: { signature: 'sig', algo: 'ed25519', key_id: 'key-1' },
        },
      ],
    })),
  },
}))

describe('Transparency Auctions Page', () => {
  it('renders list with a row and integrity badge', async () => {
    render(<Page />)
    await waitFor(() => expect(screen.queryByText(/Loading/i)).not.toBeInTheDocument())

    expect(screen.getByText('Transparency — Auctions')).toBeInTheDocument()
    expect(screen.getByText('pl-1')).toBeInTheDocument()
    expect(screen.getByText(/Signed/)).toBeInTheDocument()
  })
})
