import { Request, Response } from 'express'
import { ingestAdapterSpanBatch, queryAdapterMetrics, queryTraces, type AdapterSpanEvent } from '../services/byoTelemetryService'

/**
 * POST /api/v1/analytics/byo/spans
 * Ingest a batch of adapter span events from SDK (sampled, privacy-clean).
 * Authentication: rate-limited, no session required (SDK). Tenancy inferred from headers where available.
 */
export async function ingestByoSpans(req: Request, res: Response) {
  try {
    const body = (req.body ?? []) as AdapterSpanEvent[]
    if (!Array.isArray(body)) {
      return res.status(400).json({ error: 'invalid_payload', message: 'Expected an array of span events' })
    }
    ingestAdapterSpanBatch(req, body)
    return res.json({ success: true })
  } catch (e: any) {
    return res.status(500).json({ error: 'ingest_error', message: e?.message || 'Unknown error' })
  }
}

/**
 * GET /api/v1/analytics/byo/adapter-metrics
 * Query summary metrics (p50/p95/p99 + counters) for BYO adapter spans.
 */
export async function getByoAdapterMetrics(req: Request, res: Response) {
  try {
    const { appId, placement, adapter, from, to } = req.query as any
    if (!appId) return res.status(400).json({ error: 'missing_appId' })
    const publisherId = (req as any).user?.publisherId || 'unknown'
    const data = queryAdapterMetrics({
      appId: String(appId),
      placement: placement ? String(placement) : undefined,
      adapter: adapter ? String(adapter) : undefined,
      from: from ? Number(from) : undefined,
      to: to ? Number(to) : undefined,
      publisherId,
    })
    return res.json(data)
  } catch (e: any) {
    return res.status(500).json({ error: 'metrics_error', message: e?.message || 'Unknown error' })
  }
}

/**
 * GET /api/v1/analytics/byo/traces
 * Return recent sanitized traces (grouped spans by trace_id).
 */
export async function getByoTraces(req: Request, res: Response) {
  try {
    const { appId, placement, adapter, from, to, limit } = req.query as any
    if (!appId) return res.status(400).json({ error: 'missing_appId' })
    const publisherId = (req as any).user?.publisherId || 'unknown'
    const data = queryTraces({
      appId: String(appId),
      placement: placement ? String(placement) : undefined,
      adapter: adapter ? String(adapter) : undefined,
      from: from ? Number(from) : undefined,
      to: to ? Number(to) : undefined,
      limit: limit ? Number(limit) : 100,
      publisherId,
    })
    return res.json({ traces: data })
  } catch (e: any) {
    return res.status(500).json({ error: 'traces_error', message: e?.message || 'Unknown error' })
  }
}
