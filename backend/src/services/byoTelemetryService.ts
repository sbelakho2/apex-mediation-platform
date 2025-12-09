import type { Request } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { query } from '../utils/postgres'

export type AdapterSpanStart = {
  eventType: 'ADAPTER_SPAN_START'
  timestamp: number
  placement: string
  networkName: string
  metadata: { trace_id: string; phase: 'start' }
}

export type AdapterSpanFinish = {
  eventType: 'ADAPTER_SPAN_FINISH'
  timestamp: number
  placement: string
  networkName: string
  latency?: number
  errorCode?: string
  errorMessage?: string
  metadata: { trace_id: string; phase: 'finish'; outcome: 'fill'|'no_fill'|'timeout'|'error'; [k: string]: any }
}

export type AdapterSpanEvent = AdapterSpanStart | AdapterSpanFinish

export type StoredSpan = {
  appId: string
  publisherId: string
  placement: string
  adapter: string
  traceId: string
  startedAt?: number
  finishedAt?: number
  latencyMs?: number
  outcome?: 'fill'|'no_fill'|'timeout'|'error'
  errorCode?: string
}

// Simple in-memory store with TTL buckets (dev/MVP). Replace with DB for production durability.
const SPAN_TTL_MS = 14 * 24 * 60 * 60 * 1000 // 14d
const spans: StoredSpan[] = []

function now(): number { return Date.now() }

function prune() {
  const cutoff = now() - SPAN_TTL_MS
  for (let i = spans.length - 1; i >= 0; i--) {
    if ((spans[i].startedAt ?? spans[i].finishedAt ?? 0) < cutoff) spans.splice(i, 1)
  }
}

function getTenantContext(req: Request): { appId: string; publisherId: string } {
  const appId = (req.headers['x-app-id'] as string) || (req.query.appId as string) || 'unknown'
  const publisherId = (req as any).user?.publisherId || 'unknown'
  return { appId, publisherId }
}

export async function ingestAdapterSpanBatch(req: Request, events: AdapterSpanEvent[]) {
  prune()
  const { appId, publisherId } = getTenantContext(req)
  for (const ev of events) {
    if (!ev || !ev.metadata || typeof ev.metadata.trace_id !== 'string') continue
    const key = {
      appId,
      publisherId,
      placement: ev.placement,
      adapter: ev.networkName,
      traceId: ev.metadata.trace_id,
    }
    if (ev.eventType === 'ADAPTER_SPAN_START') {
      spans.push({ ...key, startedAt: ev.timestamp })
    } else {
      // find existing by trace or create finish-only record
      const idx = spans.findIndex(s => s.appId === appId && s.publisherId === publisherId && s.traceId === key.traceId && s.adapter === key.adapter && s.placement === key.placement)
      const base: StoredSpan = idx >= 0 ? spans[idx] : { ...key }
      base.finishedAt = ev.timestamp
      base.latencyMs = typeof ev.latency === 'number' ? ev.latency : base.latencyMs
      const outcome = ev.metadata?.outcome
      if (outcome === 'fill' || outcome === 'no_fill' || outcome === 'timeout' || outcome === 'error') base.outcome = outcome
      if (ev.errorCode) base.errorCode = ev.errorCode
      if (idx >= 0) {
        spans[idx] = base
      } else {
        spans.push(base)
      }
    }
    // Persist a summary row for durability/Grafana tables; best-effort so ingestion never fails.
    try {
      await persistSpanEvent(ev, appId, publisherId)
    } catch (e) {
      // Swallow to avoid impacting SDK ingestion
    }
  }
}

async function persistSpanEvent(ev: AdapterSpanEvent, appId: string, publisherId: string) {
  const observed = new Date(typeof ev.timestamp === 'number' ? ev.timestamp : Date.now())
  const payload: Record<string, any> = {
    placement: ev.placement,
    adapter: ev.networkName,
    metadata: ev.metadata,
  }
  if (ev.eventType === 'ADAPTER_SPAN_FINISH') {
    if (typeof ev.latency === 'number') payload.latency_ms = ev.latency
    if (ev.errorCode) payload.error_code = ev.errorCode
    if (ev.errorMessage) payload.error_message = ev.errorMessage
  }
  await query(
    `INSERT INTO analytics_sdk_telemetry (
      event_id, observed_at, publisher_id, adapter_id, event_type, severity, message, error_message, payload
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [
      uuidv4(),
      observed,
      publisherId || 'unknown',
      ev.networkName,
      ev.eventType,
      'info',
      ev.eventType,
      (ev as any).errorMessage ?? null,
      payload,
    ]
  )
}

export function queryAdapterMetrics(params: {
  appId: string
  placement?: string
  adapter?: string
  from?: number
  to?: number
  publisherId: string
}) {
  prune()
  const from = params.from ?? (now() - 60 * 60 * 1000)
  const to = params.to ?? now()
  const rows = spans.filter(s => s.appId === params.appId && s.publisherId === params.publisherId && (!params.placement || s.placement === params.placement) && (!params.adapter || s.adapter === params.adapter) && ((s.finishedAt ?? s.startedAt ?? 0) >= from) && ((s.finishedAt ?? s.startedAt ?? 0) <= to))

  const latencies = rows.map(r => r.latencyMs).filter((v): v is number => typeof v === 'number').sort((a,b)=>a-b)
  const n = latencies.length
  const percentile = (p: number) => {
    if (n === 0) return 0
    const idx = Math.floor(p * (n - 1))
    return latencies[Math.min(Math.max(idx,0), n-1)]
  }
  const counts = {
    fills: rows.filter(r => r.outcome === 'fill').length,
    noFills: rows.filter(r => r.outcome === 'no_fill').length,
    timeouts: rows.filter(r => r.outcome === 'timeout').length,
    errors: rows.filter(r => r.outcome === 'error').length,
  }
  return {
    summary: {
      p50: percentile(0.5),
      p95: percentile(0.95),
      p99: percentile(0.99),
      ...counts,
      total: rows.length,
    },
  }
}

export function queryTraces(params: {
  appId: string
  placement?: string
  adapter?: string
  from?: number
  to?: number
  limit?: number
  publisherId: string
}) {
  prune()
  const from = params.from ?? (now() - 60 * 60 * 1000)
  const to = params.to ?? now()
  const rows = spans.filter(s => s.appId === params.appId && s.publisherId === params.publisherId && (!params.placement || s.placement === params.placement) && (!params.adapter || s.adapter === params.adapter) && ((s.finishedAt ?? s.startedAt ?? 0) >= from) && ((s.finishedAt ?? s.startedAt ?? 0) <= to))
  const grouped = new Map<string, { trace_id: string; placement: string; startedAt?: number; spans: Array<{ adapter: string; t0?: number; t1?: number; outcome?: string; latency_ms?: number; error_code?: string }> }>()
  for (const r of rows) {
    const key = `${r.traceId}|${r.placement}`
    if (!grouped.has(key)) grouped.set(key, { trace_id: r.traceId, placement: r.placement, startedAt: r.startedAt, spans: [] })
    grouped.get(key)!.spans.push({ adapter: r.adapter, t0: r.startedAt, t1: r.finishedAt, outcome: r.outcome, latency_ms: r.latencyMs, error_code: r.errorCode })
  }
  let list = Array.from(grouped.values()).sort((a,b)=> (b.startedAt??0) - (a.startedAt??0))
  if (params.limit && params.limit > 0) list = list.slice(0, params.limit)
  return list
}

export function __resetTelemetryStore() {
  spans.length = 0
}
