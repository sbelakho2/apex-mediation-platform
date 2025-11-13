import request from 'supertest'
import express from 'express'
import billingRoutes from '../../src/routes/billing.routes'

jest.mock('../../src/middleware/auth', () => ({
  authenticate: (req: any, _res: any, next: any) => {
    req.user = { userId: 'user-123' }
    next()
  },
  authorize: () => (_req: any, _res: any, next: any) => next(),
}))

jest.mock('../../src/services/invoiceService', () => ({
  invoiceService: {
    listInvoices: jest.fn(),
    getInvoice: jest.fn(),
    generateInvoiceETag: jest.fn(),
    generateInvoicePDF: jest.fn(),
  },
}))

import { invoiceService } from '../../src/services/invoiceService'

describe('Billing API — invoices endpoints (contract)', () => {
  const app = express()
  app.use(express.json())
  app.use('/billing', billingRoutes)
  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(err?.statusCode || err?.status || 500).json({ error: err?.message || 'error' })
  })

  beforeEach(() => {
    process.env.BILLING_ENABLED = 'true'
    jest.resetAllMocks()

    ;(invoiceService.listInvoices as jest.Mock).mockResolvedValue({
      invoices: [
        {
          id: 'inv_1',
          invoice_number: '0001',
          customer_id: 'user-123',
          subscription_id: null,
          invoice_date: '2025-01-01',
          due_date: '2025-01-15',
          amount_cents: 1000,
          tax_amount_cents: 0,
          total_amount_cents: 1000,
          currency: 'usd',
          status: 'paid',
          paid_at: '2025-01-10',
          stripe_invoice_id: 'in_123',
          pdf_url: null,
          line_items: [],
          notes: null,
          created_at: '2025-01-01',
          updated_at: '2025-01-10',
        },
      ],
      total: 1,
    })
  })

  it('GET /billing/invoices returns expected shape', async () => {
    const res = await request(app)
      .get('/billing/invoices')
      .query({ organizationId: '550e8400-e29b-41d4-a716-446655440000' })

    expect(res.status).toBe(200)
    expect(Array.isArray(res.body?.data)).toBe(true)
    expect(res.body?.pagination).toMatchObject({
      page: expect.any(Number),
      limit: expect.any(Number),
      total: expect.any(Number),
      pages: expect.any(Number),
    })
  })
})
