import { analyticsByo } from '@/lib/api'

jest.mock('@/lib/api-client', () => {
  const get = jest.fn()
  return {
    apiClient: { get: jest.fn() },
    fraudApiClient: { get: jest.fn() },
    analyticsApiClient: { get },
  }
})

describe('analyticsByo API helpers', () => {
  const { analyticsApiClient } = jest.requireMock('@/lib/api-client') as any

  beforeEach(() => {
    jest.resetAllMocks()
  })

  it('getAdapterMetrics forwards params and unwraps payload', async () => {
    const payload = { summary: { p50: 12, p95: 34, p99: 56, fills: 1, noFills: 2, timeouts: 3, errors: 4, total: 10 } }
    ;(analyticsApiClient.get as jest.Mock).mockResolvedValueOnce({ data: payload })
    const res = await analyticsByo.getAdapterMetrics({ appId: 'app-1', placement: 'home', adapter: 'admob', from: 1, to: 2 })
    expect(analyticsApiClient.get).toHaveBeenCalledWith('/analytics/byo/adapter-metrics', { params: { appId: 'app-1', placement: 'home', adapter: 'admob', from: 1, to: 2 } })
    expect(res.summary.p95).toBe(34)
  })

  it('getTraces forwards params and returns traces array', async () => {
    const payload = { traces: [ { trace_id: 't1', placement: 'p', spans: [{ adapter: 'admob', latency_ms: 100, outcome: 'fill' }] } ] }
    ;(analyticsApiClient.get as jest.Mock).mockResolvedValueOnce({ data: payload })
    const res = await analyticsByo.getTraces({ appId: 'app-1', limit: 5 })
    expect(analyticsApiClient.get).toHaveBeenCalledWith('/analytics/byo/traces', { params: { appId: 'app-1', limit: 5 } })
    expect(res.traces[0].trace_id).toBe('t1')
  })
})
