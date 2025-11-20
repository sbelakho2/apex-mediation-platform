"use client"

import { useCallback, useEffect, useMemo, useState } from 'react'
import { analyticsByo } from '@/lib/api'

type Summary = { p50: number; p95: number; p99: number; fills: number; noFills: number; timeouts: number; errors: number; total: number }
type Trace = { trace_id: string; placement: string; startedAt?: number; spans: Array<{ adapter: string; t0?: number; t1?: number; outcome?: string; latency_ms?: number; error_code?: string }> }

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="p-3 rounded border border-gray-200 bg-white">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  )
}

function OutcomePill({ outcome }: { outcome?: string }) {
  const map: Record<string, string> = {
    fill: 'bg-green-100 text-green-800 border-green-200',
    no_fill: 'bg-gray-100 text-gray-800 border-gray-200',
    timeout: 'bg-amber-100 text-amber-800 border-amber-200',
    error: 'bg-red-100 text-red-800 border-red-200',
  }
  const cls = map[outcome || 'no_fill'] || map['no_fill']
  const label = outcome?.toUpperCase() || 'NO_FILL'
  return <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${cls}`}>{label}</span>
}

export default function MediationDebuggerPage() {
  const [appId, setAppId] = useState('')
  const [placement, setPlacement] = useState('')
  const [adapter, setAdapter] = useState('')
  const [from, setFrom] = useState<number>(() => Date.now() - 60 * 60 * 1000)
  const [to, setTo] = useState<number>(() => Date.now())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [summary, setSummary] = useState<Summary | null>(null)
  const [traces, setTraces] = useState<Trace[]>([])

  const canRun = useMemo(() => appId.trim().length > 0, [appId])

  const refresh = useCallback(async () => {
    if (!canRun) return
    setLoading(true)
    setError(null)
    try {
      const [m, t] = await Promise.all([
        analyticsByo.getAdapterMetrics({ appId: appId.trim(), placement: placement || undefined, adapter: adapter || undefined, from, to }),
        analyticsByo.getTraces({ appId: appId.trim(), placement: placement || undefined, adapter: adapter || undefined, from, to, limit: 50 }),
      ])
      setSummary(m.summary)
      setTraces(t.traces || [])
    } catch (e: any) {
      setError(e?.message || 'Failed to load metrics')
    } finally {
      setLoading(false)
    }
  }, [appId, placement, adapter, from, to, canRun])

  useEffect(() => {
    // initial load noop; wait for user input
  }, [])

  return (
    <div className="p-6 flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Mediation Debugger (BYO)</h1>
        <p className="text-sm text-gray-600 mt-1">Sanitized, sampled adapter spans with latency percentiles and outcomes. No secrets are collected.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-gray-700">App ID</label>
          <input value={appId} onChange={e => setAppId(e.target.value)} className="mt-1 w-full rounded border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="your-app-id" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Placement (optional)</label>
          <input value={placement} onChange={e => setPlacement(e.target.value)} className="mt-1 w-full rounded border border-gray-300 px-3 py-2" placeholder="interstitial_home" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Adapter (optional)</label>
          <input value={adapter} onChange={e => setAdapter(e.target.value)} className="mt-1 w-full rounded border border-gray-300 px-3 py-2" placeholder="admob" />
        </div>
        <div className="flex gap-2">
          <button className="h-10 px-4 rounded bg-indigo-600 text-white disabled:opacity-60" disabled={!canRun || loading} onClick={refresh}>{loading ? 'Loading…' : (summary ? 'Refresh' : 'Run')}</button>
        </div>
      </div>

      {error && <div className="rounded border border-red-200 bg-red-50 text-red-800 px-3 py-2 text-sm">{error}</div>}

      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          <Stat label="p50 (ms)" value={summary.p50} />
          <Stat label="p95 (ms)" value={summary.p95} />
          <Stat label="p99 (ms)" value={summary.p99} />
          <Stat label="fills" value={summary.fills} />
          <Stat label="no_fills" value={summary.noFills} />
          <Stat label="timeouts" value={summary.timeouts} />
        </div>
      )}

      {traces.length > 0 && (
        <div className="overflow-x-auto">
          <table className="min-w-full border border-gray-200 rounded">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left text-sm font-medium text-gray-700 p-2 border-b">Trace</th>
                <th className="text-left text-sm font-medium text-gray-700 p-2 border-b">Placement</th>
                <th className="text-left text-sm font-medium text-gray-700 p-2 border-b">Spans</th>
              </tr>
            </thead>
            <tbody>
              {traces.map((t) => (
                <tr key={t.trace_id} className="align-top">
                  <td className="p-2 border-b text-xs font-mono">{t.trace_id}</td>
                  <td className="p-2 border-b text-sm">{t.placement}</td>
                  <td className="p-2 border-b text-xs">
                    <div className="flex flex-wrap gap-2">
                      {t.spans.map((s, idx) => (
                        <div key={idx} className="flex items-center gap-2 rounded border border-gray-200 px-2 py-1 bg-white">
                          <span className="font-medium">{s.adapter}</span>
                          <OutcomePill outcome={s.outcome} />
                          {typeof s.latency_ms === 'number' && <span className="text-gray-600">{s.latency_ms}ms</span>}
                        </div>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
