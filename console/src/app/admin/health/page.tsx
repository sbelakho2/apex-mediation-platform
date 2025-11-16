'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { apiClient } from '@/lib/api-client'
import { useAdminGate } from '@/lib/useAdminGate'

type MetaInfo = { name: string; version: string; environment: string }

type RedSummary = {
  api_rps_5m: number | null
  api_error_rate_5m: number | null
  api_p95_latency_5m: number | null
  rtb_p95_latency_5m: number | null
  rtb_adapter_timeouts_rps_5m: number | null
  timestamp: string
}

type ThresholdConfig = {
  warn: number
  crit: number
}

const safeNumber = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

const sanitizeNumberInput = (value: unknown, fallback: number): number => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

const POLL_INTERVAL_MS = safeNumber(process.env.NEXT_PUBLIC_ADMIN_HEALTH_POLL_INTERVAL_MS, 30_000)

const DEFAULT_RED_THRESHOLDS: Record<'latency' | 'error' | 'timeouts', ThresholdConfig> = Object.freeze({
  latency: {
    warn: safeNumber(process.env.NEXT_PUBLIC_ADMIN_HEALTH_LATENCY_WARN, 0.5),
    crit: safeNumber(process.env.NEXT_PUBLIC_ADMIN_HEALTH_LATENCY_CRIT, 1.0),
  },
  error: {
    warn: safeNumber(process.env.NEXT_PUBLIC_ADMIN_HEALTH_ERROR_WARN, 0.01),
    crit: safeNumber(process.env.NEXT_PUBLIC_ADMIN_HEALTH_ERROR_CRIT, 0.05),
  },
  timeouts: {
    warn: safeNumber(process.env.NEXT_PUBLIC_ADMIN_HEALTH_TIMEOUT_WARN, 1),
    crit: safeNumber(process.env.NEXT_PUBLIC_ADMIN_HEALTH_TIMEOUT_CRIT, 5),
  },
})

const THRESHOLD_STORAGE_KEY = 'admin-health-thresholds'
const THRESHOLD_CONTROL_CONFIG: ReadonlyArray<{
  key: keyof typeof DEFAULT_RED_THRESHOLDS
  label: string
  step: number
  multiplier?: number
}> = [
  { key: 'latency', label: 'Latency (s)', step: 0.01 },
  { key: 'error', label: 'Error Rate (%)', step: 0.001, multiplier: 100 },
  { key: 'timeouts', label: 'Adapter Timeouts (RPS)', step: 0.1 },
]

const cloneThresholds = (
  source: Record<'latency' | 'error' | 'timeouts', ThresholdConfig> = DEFAULT_RED_THRESHOLDS
) => ({
  latency: { ...source.latency },
  error: { ...source.error },
  timeouts: { ...source.timeouts },
})

const isAbortError = (error: unknown) => {
  if (!error) return false
  if ((error as any)?.code === 'ERR_CANCELED') return true
  if (error instanceof DOMException && error.name === 'AbortError') return true
  return false
}

export default function AdminHealthPage() {
  const { isAdmin, isLoading: gateLoading } = useAdminGate()
  const router = useRouter()
  const [info, setInfo] = useState<MetaInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [red, setRed] = useState<RedSummary | null>(null)
  const [redError, setRedError] = useState<string | null>(null)
  const [redLoading, setRedLoading] = useState<boolean>(true)
  const [thresholds, setThresholds] = useState(() => cloneThresholds())

  useEffect(() => {
    if (typeof window === 'undefined') return
    const raw = window.localStorage.getItem(THRESHOLD_STORAGE_KEY)
    if (!raw) return
    try {
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object') {
        setThresholds((prev) => ({
          latency: {
            warn: sanitizeNumberInput(parsed.latency?.warn, prev.latency.warn),
            crit: sanitizeNumberInput(parsed.latency?.crit, prev.latency.crit),
          },
          error: {
            warn: sanitizeNumberInput(parsed.error?.warn, prev.error.warn),
            crit: sanitizeNumberInput(parsed.error?.crit, prev.error.crit),
          },
          timeouts: {
            warn: sanitizeNumberInput(parsed.timeouts?.warn, prev.timeouts.warn),
            crit: sanitizeNumberInput(parsed.timeouts?.crit, prev.timeouts.crit),
          },
        }))
      }
    } catch (err) {
      console.warn('Failed to parse admin health thresholds', err)
    }
  }, [])

  const persistThresholds = useCallback((next: typeof thresholds) => {
    const cloned = cloneThresholds(next)
    setThresholds(cloned)
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(THRESHOLD_STORAGE_KEY, JSON.stringify(cloned))
    }
  }, [])

  const handleThresholdChange = useCallback(
    (metric: keyof typeof thresholds, level: keyof ThresholdConfig, value: string) => {
      const numeric = Number(value)
      if (!Number.isFinite(numeric) || numeric < 0) return
      const next = {
        ...thresholds,
        [metric]: {
          ...thresholds[metric],
          [level]: numeric,
        },
      }
      if (next[metric].crit < next[metric].warn) {
        next[metric].crit = next[metric].warn
      }
      persistThresholds(next)
    },
    [persistThresholds, thresholds]
  )

  const resetThresholds = useCallback(() => {
    persistThresholds(cloneThresholds())
  }, [persistThresholds])

  useEffect(() => {
    if (gateLoading) return
    if (!isAdmin) {
      const timeout = setTimeout(() => router.replace('/403'), 1200)
      return () => clearTimeout(timeout)
    }
  }, [gateLoading, isAdmin, router])

  useEffect(() => {
    if (!isAdmin) return
    let active = true
    const controller = new AbortController()
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const res = await apiClient.get('/meta/info', { signal: controller.signal })
        if (active) setInfo(res?.data?.data || null)
      } catch (e: any) {
        if (isAbortError(e)) return
        if (active) setError(e?.message || 'Failed to load meta info')
      } finally {
        if (active) setLoading(false)
      }
    }
    load()
    return () => {
      active = false
      controller.abort()
    }
  }, [isAdmin])

  useEffect(() => {
    if (!isAdmin) return
    let active = true
    let controller: AbortController | null = null
    let timeoutId: ReturnType<typeof setTimeout> | null = null

    const loadRed = async (options: { initial?: boolean } = {}) => {
      controller?.abort()
      controller = new AbortController()
      if (options.initial) setRedLoading(true)
      try {
        const res = await apiClient.get('/admin/health/red', { signal: controller.signal })
        if (active) {
          setRed(res?.data?.data || null)
          setRedError(null)
        }
      } catch (e: any) {
        if (isAbortError(e)) return
        if (active) setRedError(e?.message || 'Failed to load RED metrics')
      } finally {
        if (options.initial && active) {
          setRedLoading(false)
        }
        if (active && !document.hidden) {
          timeoutId = setTimeout(() => loadRed(), POLL_INTERVAL_MS)
        }
      }
    }

    const handleVisibilityChange = () => {
      if (document.hidden) {
        controller?.abort()
        if (timeoutId) {
          clearTimeout(timeoutId)
          timeoutId = null
        }
      } else {
        loadRed()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    loadRed({ initial: true })
    return () => {
      active = false
      controller?.abort()
      if (timeoutId) clearTimeout(timeoutId)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [isAdmin])

  function redStatusColor(kind: 'latency' | 'error' | 'timeouts', v: number | null) {
    if (v == null || isNaN(v)) return 'bg-gray-100 text-gray-800 border-gray-200'
    const { warn, crit } = thresholds[kind]
    if (v >= crit) return 'bg-red-100 text-red-800 border-red-200'
    if (v >= warn) return 'bg-yellow-100 text-yellow-800 border-yellow-200'
    return 'bg-green-100 text-green-800 border-green-200'
  }

  if (gateLoading) {
    return (
      <div className="bg-white border rounded-lg p-6 text-gray-700" role="status">
        Checking admin permissions…
      </div>
    )
  }

  if (!isAdmin) {
    return (
      <div className="bg-white border rounded-lg p-6 text-gray-700" role="alert">
        You need admin permissions to view health metrics. Redirecting…
      </div>
    )
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
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Alert Thresholds</h2>
            <p className="text-sm text-gray-600">
              Adjust warning and critical thresholds without redeploying. Values persist per browser.
            </p>
          </div>
          <button type="button" className="btn btn-outline btn-sm" onClick={resetThresholds}>
            Reset defaults
          </button>
        </div>
        <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
          {THRESHOLD_CONTROL_CONFIG.map(({ key, label, step, multiplier }) => (
            <div key={key} className="p-4 rounded-lg border space-y-3">
              <div className="text-sm font-medium text-gray-700">{label}</div>
              <div className="flex flex-col gap-2">
                <label className="text-xs text-gray-500" htmlFor={`${key}-warn`}>
                  Warning
                </label>
                <input
                  id={`${key}-warn`}
                  type="number"
                  min={0}
                  step={step}
                  className="input"
                  value={
                    multiplier ? thresholds[key].warn * (multiplier ?? 1) : thresholds[key].warn
                  }
                  onChange={(event) =>
                    handleThresholdChange(
                      key,
                      'warn',
                      multiplier ? (Number(event.target.value) / (multiplier ?? 1)).toString() : event.target.value
                    )
                  }
                />
                <label className="text-xs text-gray-500" htmlFor={`${key}-crit`}>
                  Critical
                </label>
                <input
                  id={`${key}-crit`}
                  type="number"
                  min={0}
                  step={step}
                  className="input"
                  value={
                    multiplier ? thresholds[key].crit * (multiplier ?? 1) : thresholds[key].crit
                  }
                  onChange={(event) =>
                    handleThresholdChange(
                      key,
                      'crit',
                      multiplier ? (Number(event.target.value) / (multiplier ?? 1)).toString() : event.target.value
                    )
                  }
                />
              </div>
            </div>
          ))}
        </div>
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
