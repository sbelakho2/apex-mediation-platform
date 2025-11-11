import { render } from '@testing-library/react'
import { axe } from 'jest-axe'
import InvoiceDetailPage from './page'

jest.mock('@/lib/billing', () => ({
  getInvoice: jest.fn().mockResolvedValue({
    id: '1',
    invoice_number: 'INV-001',
    amount: 9900,
    currency: 'usd',
    status: 'paid',
    period_start: '2025-10-01T00:00:00Z',
    period_end: '2025-10-31T23:59:59Z',
    due_date: '2025-11-15T00:00:00Z',
    paid_at: '2025-11-10T12:00:00Z',
    created_at: '2025-11-01T00:00:00Z',
    line_items: [
      {
        description: 'Indie Plan',
        quantity: 1,
        unit_amount: 9900,
        amount: 9900,
      },
    ],
  }),
  downloadInvoicePDF: jest.fn(),
}))

jest.mock('@tanstack/react-query', () => ({
  useQuery: jest.fn(() => ({
    data: {
      id: '1',
      invoice_number: 'INV-001',
      amount: 9900,
      currency: 'usd',
      status: 'paid',
      line_items: [],
    },
    isLoading: false,
    error: null,
  })),
  useMutation: jest.fn(() => ({
    mutate: jest.fn(),
    isPending: false,
  })),
}))

jest.mock('next/navigation', () => ({
  useParams: () => ({ id: '1' }),
}))

describe('InvoiceDetailPage Accessibility', () => {
  it('should have no accessibility violations', async () => {
    const { container } = render(<InvoiceDetailPage />)
    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })

  it('should have proper heading structure', () => {
    const { container } = render(<InvoiceDetailPage />)
    
    const h1 = container.querySelector('h1')
    expect(h1).toBeInTheDocument()
    expect(h1?.textContent).toContain('Invoice')
  })

  it('should have accessible download button', () => {
    const { getByRole } = render(<InvoiceDetailPage />)
    
    const downloadButton = getByRole('button', { name: /download/i })
    expect(downloadButton).toBeInTheDocument()
    expect(downloadButton).toHaveAttribute('type', 'button')
  })

  it('should have proper table structure for line items', () => {
    const { container } = render(<InvoiceDetailPage />)
    
    const table = container.querySelector('table')
    if (table) {
      const headers = table.querySelectorAll('th')
      expect(headers.length).toBeGreaterThan(0)
      
      headers.forEach(header => {
        expect(header).toHaveAttribute('scope')
      })
    }
  })

  it('should have accessible status indicator', async () => {
    const { container } = render(<InvoiceDetailPage />)
    
    // Status should be visible and have good contrast
    const results = await axe(container, {
      rules: {
        'color-contrast': { enabled: true }
      }
    })
    
    expect(results).toHaveNoViolations()
  })
})
