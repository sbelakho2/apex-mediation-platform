import request from 'supertest'
import express from 'express'
import privacyRoutes from '../../routes/privacy.routes'

// Mock authenticate middleware to inject a user context
jest.mock('../../middleware/auth', () => ({
  authenticate: (_req: any, _res: any, next: any) => next(),
}))

// Spy on queueManager.addJob
jest.mock('../../queues/queueManager', () => {
  const actual = jest.requireActual('../../queues/queueManager')
  return {
    ...actual,
    queueManager: {
      addJob: jest.fn(async () => ({ id: 'job_del_456' })),
    },
    QueueName: actual.QueueName,
  }
})

describe('POST /privacy/delete', () => {
  const app = express()
  app.use(express.json())
  // Inject a fake user into request
  app.use((req, _res, next) => {
    ;(req as any).user = { id: 'user_1', tenantId: 'tenant_1' }
    next()
  })
  app.use('/privacy', privacyRoutes)

  it('enqueues delete job and returns job id', async () => {
    const res = await request(app).post('/privacy/delete').send()
    expect(res.status).toBe(202)
    expect(res.body).toHaveProperty('status', 'queued')
    expect(res.body).toHaveProperty('jobId')
  })

  it('validates tenant/user context', async () => {
    const app2 = express()
    app2.use(express.json())
    // no user context
    app2.use('/privacy', privacyRoutes)
    const res = await request(app2).post('/privacy/delete').send()
    expect(res.status).toBe(400)
  })
})
