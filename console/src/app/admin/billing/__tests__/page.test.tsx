import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import AdminBillingOpsPage from '../page'
import { reconcileBilling, resendInvoiceEmail } from '@/lib/billing'
import type { ReconciliationResult } from '@/lib/billing'

jest.mock('@/lib/billing', () => ({
  reconcileBilling: jest.fn(),
  resendInvoiceEmail: jest.fn(),
}))

const mockedReconcileBilling = reconcileBilling as jest.MockedFunction<typeof reconcileBilling>
const mockedResendInvoiceEmail = resendInvoiceEmail as jest.MockedFunction<typeof resendInvoiceEmail>

const baseReconcileResult: ReconciliationResult = {
  success: true,
  discrepancies: [],
  total_discrepancy_amount: 0,
  reconciliation_id: 'rec_test',
  timestamp: new Date().toISOString(),
}

describe('AdminBillingOpsPage', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  mockedReconcileBilling.mockResolvedValue(baseReconcileResult)
    mockedResendInvoiceEmail.mockResolvedValue(undefined)
  })

  it('requires acknowledgement before triggering reconciliation', async () => {
    render(<AdminBillingOpsPage />)

    const reconcileButton = screen.getByRole('button', { name: /reconcile now/i })
    const acknowledgementCheckbox = screen.getByRole('checkbox')

    expect(reconcileButton).toBeDisabled()
    expect(acknowledgementCheckbox).not.toBeChecked()

    fireEvent.click(acknowledgementCheckbox)
    expect(reconcileButton).not.toBeDisabled()

    fireEvent.click(reconcileButton)

    await waitFor(() => expect(mockedReconcileBilling).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(screen.getByText(/reconciliation triggered successfully/i)).toBeVisible())

    expect(screen.getByRole('checkbox')).not.toBeChecked()
    expect(screen.getByRole('button', { name: /reconcile now/i })).toBeDisabled()
  })

  it('resends invoice email when valid details are provided', async () => {
    render(<AdminBillingOpsPage />)

    const invoiceInput = screen.getByLabelText(/invoice identifier/i)
    const emailInput = screen.getByLabelText(/billing email/i)
    const resendButton = screen.getByRole('button', { name: /resend invoice email/i })

    expect(resendButton).toBeDisabled()
    expect(screen.getByText(/both invoice id/i)).toBeVisible()

    fireEvent.change(invoiceInput, { target: { value: '  inv_123  ' } })
    fireEvent.change(emailInput, { target: { value: '  billing@example.com  ' } })

    expect(resendButton).not.toBeDisabled()

    fireEvent.click(resendButton)

    await waitFor(() =>
      expect(mockedResendInvoiceEmail).toHaveBeenCalledWith({ invoiceId: 'inv_123', email: 'billing@example.com' })
    )
    await waitFor(() => expect(screen.getByText(/invoice email queued for delivery/i)).toBeVisible())
  })
})
