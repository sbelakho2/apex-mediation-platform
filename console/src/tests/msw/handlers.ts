import { http, HttpResponse } from 'msw'

// Simple in-memory store for ETag simulation
let etagStore: Record<string, string> = {}

export const billingHandlers = [
  // List invoices success (default)
  http.get('http://localhost:4000/api/v1/billing/invoices', ({ request }) => {
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
  http.get('http://localhost:4000/api/v1/billing/invoices/:id/pdf', ({ params, request }) => {
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
]

export const errorHandlers = {
  unauthorized: http.get('http://localhost:4000/api/v1/billing/invoices', () => HttpResponse.json({ message: 'Unauthorized' }, { status: 401 })),
  forbidden: http.get('http://localhost:4000/api/v1/billing/invoices', () => HttpResponse.json({ message: 'Forbidden' }, { status: 403 })),
  notFound: http.get('http://localhost:4000/api/v1/billing/invoices', () => HttpResponse.json({ message: 'Not Found' }, { status: 404 })),
}
