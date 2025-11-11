import { render } from '@testing-library/react'
import { axe } from 'jest-axe'
import BillingSettingsPage from './page'

jest.mock('@/lib/api-client', () => ({
  apiClient: {
    get: jest.fn().mockResolvedValue({
      data: {
        plan: {
          name: 'Indie Plan',
          type: 'indie',
          price: 9900,
          currency: 'usd',
          included_impressions: 1000000,
          included_api_calls: 100000,
          included_data_transfer_gb: 50,
        },
        billing_email: 'billing@example.com',
        receipt_preferences: {
          send_receipts: true,
          send_invoices: true,
          send_usage_alerts: true,
        },
        stripe_customer_id: 'cus_123',
      },
    }),
    put: jest.fn().mockResolvedValue({ data: {} }),
    post: jest.fn().mockResolvedValue({ data: { url: 'https://portal.stripe.com' } }),
  },
}))

jest.mock('@tanstack/react-query', () => ({
  useQuery: jest.fn(() => ({
    data: {
      plan: {
        name: 'Indie Plan',
        type: 'indie',
        price: 9900,
        currency: 'usd',
        included_impressions: 1000000,
        included_api_calls: 100000,
        included_data_transfer_gb: 50,
      },
      billing_email: 'billing@example.com',
      receipt_preferences: {
        send_receipts: true,
        send_invoices: true,
        send_usage_alerts: true,
      },
      stripe_customer_id: 'cus_123',
    },
    isLoading: false,
  })),
  useMutation: jest.fn(() => ({
    mutate: jest.fn(),
    isPending: false,
  })),
  useQueryClient: jest.fn(() => ({
    invalidateQueries: jest.fn(),
  })),
}))

describe('BillingSettingsPage Accessibility', () => {
  it('should have no accessibility violations', async () => {
    const { container } = render(<BillingSettingsPage />)
    
    // Wait for content to render
    await new Promise(resolve => setTimeout(resolve, 100))
    
    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })

  it('should have proper form labels', () => {
    const { container } = render(<BillingSettingsPage />)
    
    const inputs = container.querySelectorAll('input[type="email"], input[type="checkbox"]')
    inputs.forEach(input => {
      const id = input.getAttribute('id')
      if (id) {
        const label = container.querySelector(`label[for="${id}"]`)
        expect(label).toBeInTheDocument()
      }
    })
  })

  it('should have accessible checkboxes with descriptions', () => {
    const { container } = render(<BillingSettingsPage />)
    
    const checkboxes = container.querySelectorAll('input[type="checkbox"]')
    expect(checkboxes.length).toBeGreaterThan(0)
    
    checkboxes.forEach(checkbox => {
      const label = checkbox.closest('label')
      expect(label).toBeInTheDocument()
    })
  })

  it('should have accessible buttons', () => {
    const { getAllByRole } = render(<BillingSettingsPage />)
    
    const buttons = getAllByRole('button')
    buttons.forEach(button => {
      expect(button).toHaveAttribute('type')
      expect(button.textContent).toBeTruthy()
    })
  })

  it('should have proper heading hierarchy', () => {
    const { container } = render(<BillingSettingsPage />)
    
    const h1 = container.querySelector('h1')
    expect(h1).toBeInTheDocument()
    
    const h2s = container.querySelectorAll('h2')
    expect(h2s.length).toBeGreaterThan(0)
  })

  it('should have accessible external link to Stripe Portal', () => {
    const { getByText } = render(<BillingSettingsPage />)
    
    const portalButton = getByText(/Stripe Portal/i)
    expect(portalButton).toBeInTheDocument()
  })

  it('should have accessible status messages', async () => {
    const { container } = render(<BillingSettingsPage />)
    
    // Check for role="alert" on messages
    const alerts = container.querySelectorAll('[role="alert"]')
    
    // Should have good contrast
    const results = await axe(container, {
      rules: {
        'color-contrast': { enabled: true }
      }
    })
    
    expect(results).toHaveNoViolations()
  })
})
