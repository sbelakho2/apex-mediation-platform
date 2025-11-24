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

jest.mock('../../src/services/billing/UsageMeteringService', () => ({
  usageMeteringService: {
    getCurrentPeriodUsage: jest.fn(),
    calculateOverages: jest.fn(),
    getSubscriptionDetails: jest.fn(),
  },
}))

import { usageMeteringService } from '../../src/services/billing/UsageMeteringService'

describe('Billing API — usage endpoints (contract)', () => {
  const app = express()
  app.use(express.json())
  app.use('/billing', billingRoutes)
  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(err?.statusCode || err?.status || 500).json({ error: err?.message || 'error' })
  })

  beforeEach(() => {
    process.env.BILLING_ENABLED = 'true'
    jest.resetAllMocks()

    ;(usageMeteringService.getCurrentPeriodUsage as jest.Mock).mockResolvedValue({
      customer_id: 'user-123',
      impressions: 1000,
      api_calls: 100,
      data_transfer_gb: 5,
      period_start: '2025-01-01T00:00:00Z',
      period_end: '2025-01-31T23:59:59Z',
    })

    ;(usageMeteringService.calculateOverages as jest.Mock).mockResolvedValue({
      impressions_overage: 0,
      impressions_overage_cost_cents: 0,
      api_calls_overage: 0,
      api_calls_overage_cost_cents: 0,
      data_transfer_overage_gb: 0,
      data_transfer_overage_cost_cents: 0,
      total_overage_cost_cents: 0,
    })

    ;(usageMeteringService.getSubscriptionDetails as jest.Mock).mockResolvedValue({
      plan_type: 'starter',
      included_impressions: 1_000_000,
      included_api_calls: 100_000,
      included_data_transfer_gb: 50,
    })
  })

  it('GET /billing/usage returns expected shape', async () => {
    const res = await request(app)
      .get('/billing/usage/current')
      .query({ start: '2025-01-01', end: '2025-01-31' })
    expect(res.status).toBe(200)
    expect(res.body?.data?.usage).toMatchObject({
      impressions: expect.any(Number),
      api_calls: expect.any(Number),
      data_transfer_gb: expect.any(Number),
    })
  })
})
