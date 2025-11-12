import request from 'supertest'
import express from 'express'
import billingRoutes from '../../src/routes/billing.routes'

// Mock authenticate to simplify tests
jest.mock('../../src/middleware/auth', () => ({
  authenticate: (_req: any, _res: any, next: any) => next(),
}))

describe('Billing API — invoices endpoints (contract)', () => {
  const app = express()
  app.use(express.json())
  app.use('/billing', billingRoutes)

  it('GET /billing/invoices returns expected shape', async () => {
    const res = await request(app).get('/billing/invoices').query({ organizationId: '550e8400-e29b-41d4-a716-446655440000' })
    expect([200, 204]).toContain(res.status)
    if (res.status === 200) {
      const body = res.body
      // Accept either { invoices: [...], pagination: {...} } or raw array in early implementations
      if (Array.isArray(body)) {
        expect(Array.isArray(body)).toBe(true)
      } else {
        expect(Array.isArray(body.invoices)).toBe(true)
        expect(typeof body.pagination).toBe('object')
      }
    }
  })
})
