import { http, HttpResponse } from 'msw'

/**
 * Mock Service Worker (MSW) handlers for API mocking in tests
 * 
 * Benefits:
 * - Deterministic tests (no real API calls)
 * - Fast execution (no network latency)
 * - Test edge cases easily (errors, timeouts, etc.)
 * - Works in both Jest and browser environments
 * 
 * Usage in tests:
 * - Default handlers are loaded in jest.setup.ts
 * - Override per test with server.use(...)
 * - Reset after each test with server.resetHandlers()
 */

// Simple in-memory store for ETag simulation
const etagStore: Record<string, string> = {}

export const billingHandlers = [
  // Feature flag defaults for layout/navigation
  http.get('*/api/v1/meta/features', () => {
    return HttpResponse.json({
      data: {
        transparency: true,
        billing: true,
        migrationStudio: true,
      },
    })
  }),
  // List invoices success (default)
  http.get('*/api/v1/billing/invoices', ({ request }) => {
    const url = new URL(request.url)
    const status = url.searchParams.get('status')
    const page = Number(url.searchParams.get('page') || '1')
    const limit = Number(url.searchParams.get('limit') || '20')

    const invoices = [
      {
        id: 'inv_1',
        invoice_number: '2025-0001',
        customer_id: 'cus_123',
        amount: 4999,
        currency: 'USD',
        status: 'paid',
        period_start: '2025-10-01T00:00:00.000Z',
        period_end: '2025-10-31T23:59:59.999Z',
        due_date: '2025-11-15T00:00:00.000Z',
        paid_at: '2025-11-01T12:00:00.000Z',
        stripe_invoice_id: 'in_123',
        pdf_url: null,
        created_at: '2025-11-01T12:00:00.000Z',
        updated_at: '2025-11-01T12:00:00.000Z',
      },
    ]

    const filtered = status && status !== 'all' ? invoices.filter((i) => i.status === status) : invoices
    return HttpResponse.json({
      invoices: filtered,
      pagination: { page, limit, total: filtered.length, total_pages: 1 },
    })
  }),

  // Invoice PDF with ETag and 304 support
  http.get('*/api/v1/billing/invoices/:id/pdf', ({ params, request }) => {
    const id = params.id as string
    const currentEtag = etagStore[id] || 'W/"pdf-etag-1"'
    const ifNoneMatch = request.headers.get('if-none-match')

    if (ifNoneMatch && ifNoneMatch === currentEtag) {
      return new HttpResponse(null, { status: 304, headers: { ETag: currentEtag, 'Content-Type': 'application/pdf' } })
    }

    // New ETag each time to simulate a new version if store changed
    etagStore[id] = currentEtag
    const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]) // "%PDF" header bytes
    return new HttpResponse(pdfBytes, {
      status: 200,
      headers: { 'Content-Type': 'application/pdf', ETag: currentEtag },
    })
  }),

  // Dashboard stats
  http.get('*/api/v1/dashboard/stats', () => {
    return HttpResponse.json({
      revenue: { today: 1234.56, week: 8765.43, month: 35678.90 },
      impressions: { today: 125000, week: 875000, month: 3567890 },
      fill_rate: { today: 0.85, week: 0.87, month: 0.86 },
    })
  }),

  // User profile
  http.get('*/api/v1/users/me', () => {
    return HttpResponse.json({
      id: 'user_123',
      email: 'test@example.com',
      name: 'Test User',
      role: 'admin',
    })
  }),
]

/**
 * Error handlers for testing error scenarios
 * Use in tests: server.use(errorHandlers.unauthorized)
 */
export const errorHandlers = {
  unauthorized: http.get('*/api/v1/billing/invoices', () => 
    HttpResponse.json({ message: 'Unauthorized' }, { status: 401 })
  ),
  forbidden: http.get('*/api/v1/billing/invoices', () => 
    HttpResponse.json({ message: 'Forbidden' }, { status: 403 })
  ),
  notFound: http.get('*/api/v1/billing/invoices', () => 
    HttpResponse.json({ message: 'Not Found' }, { status: 404 })
  ),
  networkError: http.get('*/api/v1/billing/invoices', () => 
    HttpResponse.error()
  ),
  timeout: http.get('*/api/v1/billing/invoices', async () => {
    await new Promise(resolve => setTimeout(resolve, 10000)) // Simulate timeout
    return HttpResponse.json({ message: 'Timeout' }, { status: 408 })
  }),
}

/**
 * Delay handler for testing loading states
 * Use in tests: server.use(delayedHandlers.slow)
 */
export const delayedHandlers = {
  slow: http.get('*/api/v1/billing/invoices', async () => {
    await new Promise(resolve => setTimeout(resolve, 2000))
    return HttpResponse.json({ invoices: [], pagination: { page: 1, limit: 20, total: 0, total_pages: 0 } })
  }),
}
