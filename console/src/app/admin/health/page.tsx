'use client'

import { useEffect, useState } from 'react'
import { apiClient } from '@/lib/api-client'

type MetaInfo = { name: string; version: string; environment: string }

type RedSummary = {
  api_rps_5m: number | null
  api_error_rate_5m: number | null
  api_p95_latency_5m: number | null
  rtb_p95_latency_5m: number | null
  rtb_adapter_timeouts_rps_5m: number | null
  timestamp: string
}

export default function AdminHealthPage() {
  const [info, setInfo] = useState<MetaInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [red, setRed] = useState<RedSummary | null>(null)
  const [redError, setRedError] = useState<string | null>(null)
  const [redLoading, setRedLoading] = useState<boolean>(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      try {
        const res = await apiClient.get('/meta/info')
        if (!cancelled) setInfo(res?.data?.data || null)
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'Failed to load meta info')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    async function loadRed() {
      setRedLoading(true)
      try {
        const res = await apiClient.get('/admin/health/red')
        if (!cancelled) {
          setRed(res?.data?.data || null)
          setRedError(null)
        }
      } catch (e: any) {
        if (!cancelled) setRedError(e?.message || 'Failed to load RED metrics')
      } finally {
        if (!cancelled) setRedLoading(false)
      }
    }
    loadRed()
    const id = setInterval(loadRed, 30_000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [])

  function redStatusColor(kind: 'latency' | 'error' | 'timeouts', v: number | null) {
    if (v == null || isNaN(v)) return 'bg-gray-100 text-gray-800 border-gray-200'
    if (kind === 'latency') {
      if (v > 1.0) return 'bg-red-100 text-red-800 border-red-200'
      if (v > 0.5) return 'bg-yellow-100 text-yellow-800 border-yellow-200'
      return 'bg-green-100 text-green-800 border-green-200'
    }
    if (kind === 'error') {
      if (v > 0.05) return 'bg-red-100 text-red-800 border-red-200'
      if (v > 0.01) return 'bg-yellow-100 text-yellow-800 border-yellow-200'
      return 'bg-green-100 text-green-800 border-green-200'
    }
    // timeouts rps thresholds
    if (v > 5) return 'bg-red-100 text-red-800 border-red-200'
    if (v > 1) return 'bg-yellow-100 text-yellow-800 border-yellow-200'
    return 'bg-green-100 text-green-800 border-green-200'
  }

  return (
    <div className="space-y-6">
      <section className="bg-white border rounded-lg p-6">
        <h2 className="text-xl font-semibold text-gray-900">Service Info</h2>
        {loading ? (
          <p className="text-gray-600 mt-2">Loading…</p>
        ) : error ? (
          <p className="text-red-600 mt-2" role="alert">{error}</p>
        ) : (
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-4 rounded-lg border">
              <div className="text-sm text-gray-500">Name</div>
              <div className="text-gray-900 font-medium">{info?.name}</div>
            </div>
            <div className="p-4 rounded-lg border">
              <div className="text-sm text-gray-500">Version</div>
              <div className="text-gray-900 font-medium">{info?.version}</div>
            </div>
            <div className="p-4 rounded-lg border">
              <div className="text-sm text-gray-500">Environment</div>
              <div className="text-gray-900 font-medium">{info?.environment}</div>
            </div>
          </div>
        )}
      </section>

      <section className="bg-white border rounded-lg p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-900">RED — API & RTB (last 5m)</h2>
          {!redLoading && red?.timestamp && (
            <span className="text-xs text-gray-500">as of {new Date(red.timestamp).toLocaleTimeString()}</span>
          )}
        </div>
        {redLoading ? (
          <p className="text-gray-600 mt-2">Loading…</p>
        ) : redError ? (
          <p className="text-red-600 mt-2" role="alert">{redError}</p>
        ) : (
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {/* API RPS */}
            <div className="p-4 rounded-lg border">
              <div className="text-sm text-gray-500">API RPS</div>
              <div className="text-2xl font-bold text-gray-900">
                {red?.api_rps_5m != null ? red.api_rps_5m.toFixed(2) : '—'}
              </div>
            </div>

            {/* API Error Rate */}
            <div className={`p-4 rounded-lg border ${redStatusColor('error', red?.api_error_rate_5m ?? null)}`}>
              <div className="text-sm">API Error Rate</div>
              <div className="text-2xl font-bold">
                {red?.api_error_rate_5m != null ? `${(red.api_error_rate_5m * 100).toFixed(2)}%` : '—'}
              </div>
            </div>

            {/* API p95 Latency */}
            <div className={`p-4 rounded-lg border ${redStatusColor('latency', red?.api_p95_latency_5m ?? null)}`}>
              <div className="text-sm">API p95 Latency</div>
              <div className="text-2xl font-bold">
                {red?.api_p95_latency_5m != null ? `${red.api_p95_latency_5m.toFixed(3)}s` : '—'}
              </div>
            </div>

            {/* RTB p95 Latency */}
            <div className={`p-4 rounded-lg border ${redStatusColor('latency', red?.rtb_p95_latency_5m ?? null)}`}>
              <div className="text-sm">RTB p95 Latency</div>
              <div className="text-2xl font-bold">
                {red?.rtb_p95_latency_5m != null ? `${red.rtb_p95_latency_5m.toFixed(3)}s` : '—'}
              </div>
            </div>

            {/* Adapter Timeouts RPS */}
            <div className={`p-4 rounded-lg border ${redStatusColor('timeouts', red?.rtb_adapter_timeouts_rps_5m ?? null)}`}>
              <div className="text-sm">Adapter Timeouts (RPS)</div>
              <div className="text-2xl font-bold">
                {red?.rtb_adapter_timeouts_rps_5m != null ? red.rtb_adapter_timeouts_rps_5m.toFixed(2) : '—'}
              </div>
            </div>
          </div>
        )}
      </section>

      <section className="bg-white border rounded-lg p-6">
        <h2 className="text-xl font-semibold text-gray-900">Quick Links</h2>
        <ul className="list-disc pl-6 mt-3 text-primary-700">
          <li>
            <a className="hover:underline" href="/metrics" target="_blank" rel="noreferrer">/metrics</a>
          </li>
          <li>
            <a className="hover:underline" href="/health" target="_blank" rel="noreferrer">/health</a>
          </li>
        </ul>
      </section>
    </div>
  )
}
