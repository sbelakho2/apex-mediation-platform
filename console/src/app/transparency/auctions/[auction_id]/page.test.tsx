import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import Page from './page'

jest.mock('../../../../lib/transparency', () => ({
  transparencyApi: {
    get: jest.fn(async () => ({
      auction_id: 'auc-1',
      timestamp: new Date('2025-01-01T00:00:00.000Z').toISOString(),
      publisher_id: 'pub-1',
      app_or_site_id: 'app-1',
      placement_id: 'pl-1',
      surface_type: 'mobile_app',
      device_context: { os: 'ios', geo: 'US', att: 'authorized', tc_string_sha256: '0'.repeat(64) },
      candidates: [
        { source: 'alpha', bid_ecpm: 1.23, currency: 'USD', response_time_ms: 12, status: 'winner', metadata_hash: 'm1' },
      ],
      winner: { source: 'alpha', bid_ecpm: 1.23, gross_price: 1.11, currency: 'USD', reason: 'highest_bid' },
      fees: { aletheia_fee_bp: 150, effective_publisher_share: 0.985 },
      integrity: { signature: 'sig', algo: 'ed25519', key_id: 'key-1' },
    })),
    verify: jest.fn(async () => ({ status: 'pass', key_id: 'key-1', algo: 'ed25519', canonical: '{"a":1}', sample_bps: 250 })),
  },
}))

describe('Transparency Auction Detail Page', () => {
  it('renders integrity PASS badge and canonical payload', async () => {
    render(<Page params={{ auction_id: 'auc-1' }} /> as any)

    await waitFor(() => expect(screen.queryByText(/Loading/i)).not.toBeInTheDocument())
    expect(screen.getByText('Transparency — Auction Detail')).toBeInTheDocument()
    expect(screen.getByText(/Verify:/)).toBeInTheDocument()
    expect(screen.getByText(/PASS/)).toBeInTheDocument()
    // Canonical may be inside a details; still ensure text present
    expect(screen.getByText('{"a":1}')).toBeInTheDocument()
  })
})
