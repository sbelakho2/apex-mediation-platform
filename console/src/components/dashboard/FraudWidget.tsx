'use client'

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fraudApi, settingsApi } from '@/lib/api'
import { formatNumber, formatPercentage } from '@/lib/utils'
import { AlertTriangle, Shield, ShieldCheck, TrendingUp } from 'lucide-react'
import Link from 'next/link'
import { useFeatures } from '@/lib/useFeatures'

interface FraudWidgetProps {
  publisherId: string
}

const DEFAULT_WARNING_THRESHOLD = 0.02
const DEFAULT_CRITICAL_THRESHOLD = 0.05
const FRAUD_WARNING_THRESHOLD = Number(process.env.NEXT_PUBLIC_FRAUD_RATE_WARNING ?? DEFAULT_WARNING_THRESHOLD)
const FRAUD_CRITICAL_THRESHOLD = Number(
  process.env.NEXT_PUBLIC_FRAUD_RATE_CRITICAL ?? DEFAULT_CRITICAL_THRESHOLD
)
const FRAUD_FEATURE_FALLBACK = process.env.NEXT_PUBLIC_FRAUD_DETECTION_ENABLED !== 'false'

const clamp = (value: number, min = 0, max = 1) => {
  if (Number.isNaN(value)) return min
  return Math.min(Math.max(value, min), max)
}

export function FraudWidget({ publisherId }: FraudWidgetProps) {
  const { features } = useFeatures()
  const { data: fraudStats, isLoading } = useQuery({
    queryKey: ['fraud-stats', publisherId],
    queryFn: () => fraudApi.getStats(publisherId, { window: '24h' }).then(res => res.data),
    enabled: !!publisherId,
  })

  const {
    data: fraudSettings,
    isLoading: isFraudSettingsLoading,
    isError: isFraudSettingsError,
  } = useQuery({
    queryKey: ['settings', 'fraud'],
    queryFn: () => settingsApi.getFraudSettings().then(res => res.data),
  })

  const { warningThreshold, criticalThreshold, thresholdsSource } = useMemo(() => {
    const fallbackWarning = Number.isFinite(FRAUD_WARNING_THRESHOLD)
      ? FRAUD_WARNING_THRESHOLD
      : DEFAULT_WARNING_THRESHOLD
    const fallbackCritical = Number.isFinite(FRAUD_CRITICAL_THRESHOLD)
      ? FRAUD_CRITICAL_THRESHOLD
      : DEFAULT_CRITICAL_THRESHOLD

    if (!fraudSettings) {
      return {
        warningThreshold: fallbackWarning,
        criticalThreshold: fallbackCritical,
        thresholdsSource: 'fallback' as const,
      }
    }

    const apiWarning = clamp(fraudSettings.warningThreshold)
    const apiCritical = clamp(
      fraudSettings.blockThreshold < fraudSettings.warningThreshold
        ? fraudSettings.warningThreshold
        : fraudSettings.blockThreshold
    )

    return {
      warningThreshold: apiWarning,
      criticalThreshold: apiCritical,
      thresholdsSource: 'api' as const,
    }
  }, [fraudSettings])

  const fraudDashboardEnabled = features?.fraudDetection ?? FRAUD_FEATURE_FALLBACK

  if (isLoading) {
    return <FraudWidgetSkeleton />
  }

  if (!fraudStats) {
    return (
      <div className="card">
        <div className="text-center py-10 text-gray-500">
          <Shield className="mx-auto mb-3 h-12 w-12 text-gray-300" aria-hidden="true" />
          <p className="text-sm font-medium">No fraud data available yet</p>
          <p className="mt-1 text-xs text-gray-400">Check back once traffic starts flowing through your placements.</p>
        </div>
      </div>
    )
  }

  const fraudRateStatus =
    fraudStats.fraudRate >= criticalThreshold
      ? 'critical'
      : fraudStats.fraudRate >= warningThreshold
        ? 'warning'
        : 'normal'
  const lastUpdatedDate = fraudStats.lastUpdated ? new Date(fraudStats.lastUpdated) : null
  const lastUpdatedLabel =
    lastUpdatedDate && !Number.isNaN(lastUpdatedDate.getTime())
      ? lastUpdatedDate.toLocaleString()
      : 'Not available'

  return (
    <div className="card h-full">
      <div className="flex items-start justify-between gap-2 mb-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Risk Center</p>
          <h3 className="mt-1 text-xl font-semibold text-gray-900">Fraud Detection</h3>
        </div>
        <div
          className={`flex h-10 w-10 items-center justify-center rounded-lg ${
            fraudRateStatus === 'critical'
              ? 'bg-danger-50 text-danger-600'
              : fraudRateStatus === 'warning'
                ? 'bg-warning-50 text-warning-600'
                : 'bg-success-50 text-success-600'
          }`}
        >
          <AlertTriangle className="h-5 w-5" aria-hidden="true" />
        </div>
      </div>

      {isFraudSettingsError && (
        <div className="mb-4 rounded-lg border border-warning-200 bg-warning-50 px-3 py-2 text-xs text-warning-800">
          Couldn&rsquo;t load fraud thresholds from your settings. Showing default guardrails instead.
        </div>
      )}

      <div className="space-y-5">
        <section className="rounded-lg border border-gray-100 bg-gray-50 p-4">
          <div className="flex items-center justify-between text-sm text-gray-500">
            <span className="font-medium uppercase tracking-wide">Fraud Rate (24h)</span>
            <div className="flex items-center gap-1 text-xs text-gray-400">
              <TrendingUp className="h-4 w-4" aria-hidden="true" />
              <span>Trend insight</span>
            </div>
          </div>
          <div className="mt-3 flex items-end justify-between">
            <span
              className={`text-4xl font-semibold leading-none ${
                fraudRateStatus === 'critical'
                  ? 'text-danger-600'
                  : fraudRateStatus === 'warning'
                    ? 'text-warning-600'
                    : 'text-success-600'
              }`}
            >
              {formatPercentage(fraudStats.fraudRate, 2)}
            </span>
            <span
              className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${
                fraudRateStatus === 'critical'
                  ? 'bg-danger-100 text-danger-700'
                  : fraudRateStatus === 'warning'
                    ? 'bg-warning-100 text-warning-700'
                    : 'bg-success-100 text-success-700'
              }`}
            >
              {fraudRateStatus === 'critical' ? 'High Risk' : fraudRateStatus === 'warning' ? 'Moderate' : 'Normal'}
            </span>
          </div>
          <p className="mt-2 text-xs text-gray-500">
            Thresholds: normal &lt; {formatPercentage(warningThreshold, 0)}, moderate between {formatPercentage(warningThreshold, 0)}-
            {formatPercentage(criticalThreshold, 0)}, critical &gt; {formatPercentage(criticalThreshold, 0)} over the selected window.
            {thresholdsSource === 'fallback' && !isFraudSettingsLoading && !isFraudSettingsError && (
              <span className="block text-[11px] text-gray-400">
                Using defaults until custom thresholds are configured.
              </span>
            )}
          </p>
        </section>

        <section className="grid grid-cols-2 gap-3">
          <StatItem label="GIVT" value={formatNumber(fraudStats.givtDetections)} variant="primary" />
          <StatItem label="SIVT" value={formatNumber(fraudStats.sivtDetections)} variant="violet" />
          <StatItem label="ML Flags" value={formatNumber(fraudStats.mlDetections)} variant="warning" />
          <StatItem label="Blocked" value={formatNumber(fraudStats.blockedRequests)} variant="danger" />
        </section>

        <section className="space-y-2 rounded-lg border border-gray-100 p-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-500">Total Requests</span>
            <span className="font-semibold text-gray-900">{formatNumber(fraudStats.totalRequests)}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-500">Fraudulent Requests</span>
            <span className="font-semibold text-gray-900">{formatNumber(fraudStats.fraudRequests)}</span>
          </div>
          <div className="flex items-center justify-between text-xs text-gray-400">
            <span>Last updated</span>
            <span>{lastUpdatedLabel}</span>
          </div>
        </section>

        {fraudDashboardEnabled ? (
          <Link
            href="/fraud"
            className="btn btn-outline w-full gap-2 py-2.5 text-sm leading-tight flex flex-wrap items-center justify-center text-center whitespace-normal"
          >
            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
            View Fraud Dashboard
          </Link>
        ) : (
          <button
            type="button"
            disabled
            className="btn btn-outline w-full gap-2 py-2.5 text-sm leading-tight flex flex-wrap items-center justify-center text-center whitespace-normal cursor-not-allowed opacity-60"
            aria-disabled="true"
          >
            <Shield className="h-4 w-4" aria-hidden="true" />
            Fraud dashboard disabled for this tenant
          </button>
        )}
      </div>
    </div>
  )
}

function StatItem({ label, value, variant }: { label: string; value: string; variant: 'primary' | 'violet' | 'warning' | 'danger' }) {
  const variantMap: Record<'primary' | 'violet' | 'warning' | 'danger', string> = {
    primary: 'bg-primary-50 text-primary-700',
    violet: 'bg-violet-50 text-violet-700',
    warning: 'bg-warning-50 text-warning-700',
    danger: 'bg-danger-50 text-danger-700',
  }

  return (
    <div className={`${variantMap[variant]} rounded-lg p-3 transition-colors duration-200`}> 
      <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{label}</div>
      <div className="mt-1 text-xl font-semibold">{value}</div>
    </div>
  )
}

function FraudWidgetSkeleton() {
  return (
    <div className="card">
      <div className="animate-pulse">
        <div className="flex items-center justify-between mb-4">
          <div className="h-6 bg-gray-200 rounded w-32"></div>
          <div className="h-5 w-5 bg-gray-200 rounded"></div>
        </div>
        <div className="space-y-4">
          <div className="h-24 bg-gray-200 rounded-lg"></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="h-16 bg-gray-200 rounded-lg"></div>
            <div className="h-16 bg-gray-200 rounded-lg"></div>
            <div className="h-16 bg-gray-200 rounded-lg"></div>
            <div className="h-16 bg-gray-200 rounded-lg"></div>
          </div>
          <div className="h-10 bg-gray-200 rounded"></div>
        </div>
      </div>
    </div>
  )
}
