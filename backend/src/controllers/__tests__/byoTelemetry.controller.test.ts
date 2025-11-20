import { getByoAdapterMetrics, getByoTraces, ingestByoSpans } from '../byoTelemetry.controller'
import type { Request, Response } from 'express'

function mockReqRes(init?: Partial<Request & { user?: any }>) {
  const req = ({
    body: undefined,
    query: {},
    headers: {},
    ...init,
  } as unknown) as Request
  const json = jest.fn()
  const status = jest.fn(() => ({ json }))
  const res = ({ json, status } as unknown) as Response
  return { req, res, json, status }
}

describe('byoTelemetry.controller', () => {
  it('ingestByoSpans returns 400 on non-array payload', async () => {
    const { req, res, status, json } = mockReqRes({ body: { not: 'array' } })
    await ingestByoSpans(req, res)
    expect(status).toHaveBeenCalledWith(400)
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ error: 'invalid_payload' }))
  })

  it('getByoAdapterMetrics 400 on missing appId', async () => {
    const { req, res, status, json } = mockReqRes({ query: {} })
    await getByoAdapterMetrics(req, res)
    expect(status).toHaveBeenCalledWith(400)
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ error: 'missing_appId' }))
  })

  it('getByoTraces 400 on missing appId', async () => {
    const { req, res, status } = mockReqRes({ query: {} })
    await getByoTraces(req, res)
    expect(status).toHaveBeenCalledWith(400)
  })

  it('ingests spans then returns metrics and traces', async () => {
    const { req: ingestReq, res: ingestRes } = mockReqRes({
      headers: { 'x-app-id': 'app-xyz' },
      // @ts-expect-error partial
      user: { publisherId: 'pub-1' },
      body: [
        { eventType: 'ADAPTER_SPAN_FINISH', timestamp: Date.now(), placement: 'p', networkName: 'admob', latency: 123, metadata: { trace_id: 't1', phase: 'finish', outcome: 'fill' } },
      ],
    })
    await ingestByoSpans(ingestReq, ingestRes)

    const { req: mReq, res: mRes, json: mJson } = mockReqRes({
      // @ts-expect-error partial
      user: { publisherId: 'pub-1' },
      query: { appId: 'app-xyz' },
    })
    await getByoAdapterMetrics(mReq, mRes)
    const metrics = (mJson.mock.calls[0][0]) as any
    expect(metrics.summary.total).toBeGreaterThan(0)

    const { req: tReq, res: tRes, json: tJson } = mockReqRes({
      // @ts-expect-error partial
      user: { publisherId: 'pub-1' },
      query: { appId: 'app-xyz', limit: '5' },
    })
    await getByoTraces(tReq, tRes)
    const traces = (tJson.mock.calls[0][0]) as any
    expect(Array.isArray(traces.traces)).toBe(true)
  })
})
