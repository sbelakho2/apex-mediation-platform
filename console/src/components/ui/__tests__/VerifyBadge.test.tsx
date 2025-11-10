import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { VerifyBadge } from '../VerifyBadge'
import type { VerifyResult } from '@/lib/transparency'

const mockTransparencyApi = {
  verify: jest.fn(),
}

jest.mock('@/lib/transparency', () => ({
  transparencyApi: {
    verify: (...args: any[]) => mockTransparencyApi.verify(...args),
  },
}))

describe('VerifyBadge', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('shows "Not Signed" for unsigned auctions', () => {
    render(<VerifyBadge auctionId="auc-123" hasSigned={false} />)
    expect(screen.getByText('Not Signed')).toBeInTheDocument()
  })

  it('shows verify button when not auto-loaded', () => {
    render(<VerifyBadge auctionId="auc-123" hasSigned={true} autoLoad={false} />)
    expect(screen.getByRole('button', { name: /verify/i })).toBeInTheDocument()
  })

  it('loads verification on button click', async () => {
    const mockResult: VerifyResult = {
      status: 'pass',
      key_id: 'key-123',
      algo: 'ed25519',
    }
    mockTransparencyApi.verify.mockResolvedValue(mockResult)

    render(<VerifyBadge auctionId="auc-123" hasSigned={true} autoLoad={false} />)
    
    const button = screen.getByRole('button', { name: /verify/i })
    fireEvent.click(button)

    await waitFor(() => {
      expect(mockTransparencyApi.verify).toHaveBeenCalledWith('auc-123')
    })
  })

  it('shows loading spinner while verifying', async () => {
    mockTransparencyApi.verify.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ status: 'pass' }), 100))
    )

    render(<VerifyBadge auctionId="auc-123" hasSigned={true} autoLoad={true} />)

    // Spinner shows immediately
    expect(screen.getByText('Verifying...', { selector: '.sr-only' })).toBeInTheDocument()
  })

  it('displays PASS status with green badge', async () => {
    const mockResult: VerifyResult = {
      status: 'pass',
      key_id: 'key-123',
      algo: 'ed25519',
    }
    mockTransparencyApi.verify.mockResolvedValue(mockResult)

    render(<VerifyBadge auctionId="auc-123" hasSigned={true} autoLoad={true} />)

    await waitFor(() => {
      const badge = screen.getByText('PASS')
      expect(badge).toBeInTheDocument()
      expect(badge.className).toContain('bg-green-100')
      expect(badge.className).toContain('text-green-700')
    })
  })

  it('displays FAIL status with red badge', async () => {
    const mockResult: VerifyResult = {
      status: 'fail',
      reason: 'Signature mismatch',
    }
    mockTransparencyApi.verify.mockResolvedValue(mockResult)

    render(<VerifyBadge auctionId="auc-123" hasSigned={true} autoLoad={true} />)

    await waitFor(() => {
      const badge = screen.getByText('FAIL')
      expect(badge).toBeInTheDocument()
      expect(badge.className).toContain('bg-red-100')
      expect(badge.className).toContain('text-red-700')
    })
  })

  it('displays NOT_APPLICABLE status', async () => {
    const mockResult: VerifyResult = {
      status: 'not_applicable',
    }
    mockTransparencyApi.verify.mockResolvedValue(mockResult)

    render(<VerifyBadge auctionId="auc-123" hasSigned={true} autoLoad={true} />)

    await waitFor(() => {
      const badge = screen.getByText('N/A')
      expect(badge).toBeInTheDocument()
      expect(badge.className).toContain('bg-gray-100')
    })
  })

  it('displays UNKNOWN_KEY status', async () => {
    const mockResult: VerifyResult = {
      status: 'unknown_key',
      key_id: 'old-key-456',
    }
    mockTransparencyApi.verify.mockResolvedValue(mockResult)

    render(<VerifyBadge auctionId="auc-123" hasSigned={true} autoLoad={true} />)

    await waitFor(() => {
      const badge = screen.getByText('UNKNOWN KEY')
      expect(badge).toBeInTheDocument()
      expect(badge.className).toContain('bg-orange-100')
      expect(badge.className).toContain('text-orange-700')
    })
  })

  it('shows error state on verification failure', async () => {
    mockTransparencyApi.verify.mockRejectedValue(new Error('Network error'))

    render(<VerifyBadge auctionId="auc-123" hasSigned={true} autoLoad={true} />)

    await waitFor(() => {
      expect(screen.getByText('Error')).toBeInTheDocument()
    })
  })

  it('renders in compact mode', async () => {
    const mockResult: VerifyResult = {
      status: 'pass',
    }
    mockTransparencyApi.verify.mockResolvedValue(mockResult)

    render(<VerifyBadge auctionId="auc-123" hasSigned={true} autoLoad={true} compact={true} />)

    await waitFor(() => {
      const badge = screen.getByText('PASS')
      expect(badge.className).toContain('text-xs')
      expect(badge.className).toContain('px-2')
    })
  })

  it('does not load twice if already loaded', async () => {
    const mockResult: VerifyResult = {
      status: 'pass',
    }
    mockTransparencyApi.verify.mockResolvedValue(mockResult)

    render(<VerifyBadge auctionId="auc-123" hasSigned={true} autoLoad={true} />)

    await waitFor(() => {
      expect(screen.getByText('PASS')).toBeInTheDocument()
    })

    expect(mockTransparencyApi.verify).toHaveBeenCalledTimes(1)
  })
})
