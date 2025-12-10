import type { Request } from 'express'
import { ingestAdapterSpanBatch, queryAdapterMetrics, queryTraces, type AdapterSpanEvent, __resetTelemetryStore } from '../byoTelemetryService'

function mockReq(appId = 'app-1', publisherId = 'pub-1'): Request {
  return {
    headers: { 'x-app-id': appId },
    query: {},
    body: {},
    user: { publisherId } as any,
  } as unknown as Request;
}

describe('byoTelemetryService (in-memory)', () => {
  beforeEach(() => {
    __resetTelemetryStore()
  })

  it('ingests start/finish spans and computes percentiles and counters', async () => {
    const req = mockReq('app-1', 'pub-1')
    const base = {
      placement: 'interstitial_home',
      networkName: 'admob',
    }
    const t0 = Date.now()

    const events: AdapterSpanEvent[] = [
      { eventType: 'ADAPTER_SPAN_START', timestamp: t0, ...base, metadata: { trace_id: 't1', phase: 'start' } },
      { eventType: 'ADAPTER_SPAN_FINISH', timestamp: t0 + 100, ...base, latency: 100, metadata: { trace_id: 't1', phase: 'finish', outcome: 'fill' } },
      { eventType: 'ADAPTER_SPAN_START', timestamp: t0 + 200, ...base, metadata: { trace_id: 't2', phase: 'start' } },
      { eventType: 'ADAPTER_SPAN_FINISH', timestamp: t0 + 500, ...base, latency: 300, metadata: { trace_id: 't2', phase: 'finish', outcome: 'no_fill' } },
      { eventType: 'ADAPTER_SPAN_FINISH', timestamp: t0 + 600, ...base, latency: 400, metadata: { trace_id: 't3', phase: 'finish', outcome: 'timeout' } },
      { eventType: 'ADAPTER_SPAN_FINISH', timestamp: t0 + 700, ...base, latency: 500, errorCode: 'exception', metadata: { trace_id: 't4', phase: 'finish', outcome: 'error' } },
    ]

    await ingestAdapterSpanBatch(req, events)

    const metrics = queryAdapterMetrics({ appId: 'app-1', publisherId: 'pub-1', from: 0, to: Number.MAX_SAFE_INTEGER })
    expect(metrics.summary.total).toBeGreaterThanOrEqual(4) // finish-only counted
    // With latencies [100,300,400,500] p50 ~ index floor(0.5*(4-1))=1 => 300
    expect(metrics.summary.p50).toBe(300)
    expect(metrics.summary.fills).toBe(1)
    expect(metrics.summary.noFills).toBe(1)
    expect(metrics.summary.timeouts).toBe(1)
    expect(metrics.summary.errors).toBe(1)

    const traces = queryTraces({ appId: 'app-1', publisherId: 'pub-1', limit: 10, from: 0, to: Number.MAX_SAFE_INTEGER })
    expect(traces.length).toBeGreaterThan(0)
    expect(traces.find(t => t.trace_id === 't1')?.spans[0].latency_ms).toBe(100)
  })

  it('scopes by tenant (appId/publisherId)', async () => {
    const reqA = mockReq('app-A', 'pub-A')
    const reqB = mockReq('app-B', 'pub-B')
    await ingestAdapterSpanBatch(reqA, [
      { eventType: 'ADAPTER_SPAN_FINISH', timestamp: Date.now(), placement: 'p', networkName: 'n', latency: 120, metadata: { trace_id: 'ax', phase: 'finish', outcome: 'fill' } },
    ])
    await ingestAdapterSpanBatch(reqB, [
      { eventType: 'ADAPTER_SPAN_FINISH', timestamp: Date.now(), placement: 'p', networkName: 'n', latency: 240, metadata: { trace_id: 'bx', phase: 'finish', outcome: 'no_fill' } },
    ])

    const window = { from: 0, to: Number.MAX_SAFE_INTEGER }
    const mA = queryAdapterMetrics({ appId: 'app-A', publisherId: 'pub-A', ...window })
    const mB = queryAdapterMetrics({ appId: 'app-B', publisherId: 'pub-B', ...window })
    expect(mA.summary.total).toBe(1)
    expect(mB.summary.total).toBe(1)
  })
})
