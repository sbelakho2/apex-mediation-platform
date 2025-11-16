import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { VerifyBadge } from '../VerifyBadge'
import type { VerifyResult } from '@/lib/transparency'

const mockTransparencyApi = {
  verify: jest.fn(),
}

const expectVerifyCalled = (auctionId = 'auc-123') => {
  expect(mockTransparencyApi.verify).toHaveBeenCalledWith(
    auctionId,
    expect.objectContaining({ signal: expect.any(AbortSignal) })
  )
}

jest.mock('@/lib/transparency', () => ({
  transparencyApi: {
    verify: (...args: any[]) => mockTransparencyApi.verify(...args),
  },
}))

describe('VerifyBadge', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    ;(console.error as jest.Mock).mockRestore()
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
      expectVerifyCalled()
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

  it('shows error state with retry affordance on verification failure', async () => {
    mockTransparencyApi.verify.mockRejectedValue(new Error('Network error'))

    render(<VerifyBadge auctionId="auc-123" hasSigned={true} autoLoad={true} />)

    await waitFor(() => expect(mockTransparencyApi.verify).toHaveBeenCalled())
    const retryButton = await screen.findByRole('button', { name: /retry verification/i })
    expect(retryButton).toBeInTheDocument()
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

    expectVerifyCalled()
    expect(mockTransparencyApi.verify).toHaveBeenCalledTimes(1)
  })

  it('exposes tooltip copy for PASS status', async () => {
    const mockResult: VerifyResult = {
      status: 'pass',
    }
    mockTransparencyApi.verify.mockResolvedValue(mockResult)

    const user = userEvent.setup()
    render(<VerifyBadge auctionId="auc-123" hasSigned={true} autoLoad={true} />)

    const badge = await screen.findByText('PASS')
    await user.hover(badge)

    await waitFor(() => {
      const tooltip = screen.getByRole('tooltip')
      expect(tooltip).toHaveTextContent(/signature verified successfully/i)
    })
  })

  it('allows manual retry after a verification error', async () => {
    const user = userEvent.setup()
    mockTransparencyApi.verify
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce({ status: 'pass' })

    render(<VerifyBadge auctionId="auc-123" hasSigned={true} autoLoad={false} />)

    const verifyButton = screen.getByRole('button', { name: /verify/i })
    await user.click(verifyButton)

    const retryButton = await screen.findByRole('button', { name: /retry verification/i })
    await user.click(retryButton)

    await waitFor(() => expect(mockTransparencyApi.verify).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(screen.getByText('PASS')).toBeInTheDocument())
  })

  it('prevents duplicate requests when verify is clicked repeatedly', async () => {
    const user = userEvent.setup()
    mockTransparencyApi.verify.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ status: 'pass' }), 100))
    )

    render(<VerifyBadge auctionId="auc-123" hasSigned={true} autoLoad={false} />)

    const verifyButton = screen.getByRole('button', { name: /verify/i })
    await user.click(verifyButton)
    await user.click(verifyButton)

    expect(mockTransparencyApi.verify).toHaveBeenCalledTimes(1)
  })

  it('resets verification state when auction ID changes', async () => {
    mockTransparencyApi.verify
      .mockResolvedValueOnce({ status: 'pass' })
      .mockResolvedValueOnce({ status: 'fail', reason: 'mismatch' })

    const { rerender } = render(
      <VerifyBadge auctionId="auc-123" hasSigned={true} autoLoad={true} />
    )

    await waitFor(() => {
      expect(screen.getByText('PASS')).toBeInTheDocument()
    })

    rerender(<VerifyBadge auctionId="auc-456" hasSigned={true} autoLoad={true} />)

    await waitFor(() => {
      expect(mockTransparencyApi.verify).toHaveBeenCalledWith(
        'auc-456',
        expect.objectContaining({ signal: expect.any(AbortSignal) })
      )
      expect(screen.getByText('FAIL')).toBeInTheDocument()
    })
  })

  it('shows refresh control after a successful verification', async () => {
    const mockResult: VerifyResult = { status: 'pass' }
    mockTransparencyApi.verify.mockResolvedValue(mockResult)

    const user = userEvent.setup()
    render(<VerifyBadge auctionId="auc-123" hasSigned={true} autoLoad={true} />)

    const badge = await screen.findByText('PASS')
    expect(badge).toBeInTheDocument()

    const refreshButton = await screen.findByRole('button', {
      name: /refresh verification for auction auc-123/i,
    })

    await user.click(refreshButton)

    await waitFor(() => {
      expect(mockTransparencyApi.verify).toHaveBeenCalledTimes(2)
    })
  })

  it('sanitizes error tooltip text when verification fails', async () => {
    mockTransparencyApi.verify.mockRejectedValue(new Error('500: db exploded'))

    const user = userEvent.setup()
    render(<VerifyBadge auctionId="auc-123" hasSigned={true} autoLoad={true} />)

    const retryButton = await screen.findByRole('button', { name: /retry verification/i })
    await user.hover(retryButton)

    const tooltip = await screen.findByRole('tooltip')
    expect(tooltip).toHaveTextContent(/temporarily unavailable/i)
  })
})
