import request from 'supertest'
import express from 'express'
import billingRoutes from '../../src/routes/billing.routes'

// Mock authenticate to simplify tests
jest.mock('../../src/middleware/auth', () => ({
  authenticate: (_req: any, _res: any, next: any) => next(),
}))

describe('Billing API — usage endpoints (contract)', () => {
  const app = express()
  app.use(express.json())
  app.use('/billing', billingRoutes)

  it('GET /billing/usage returns expected shape', async () => {
    const res = await request(app).get('/billing/usage').query({ start: '2025-01-01', end: '2025-01-31' })
    expect([200, 204, 206]).toContain(res.status)
    if (res.status === 200) {
      expect(Array.isArray(res.body.items || res.body.usage || res.body)).toBe(true)
    }
  })
})
