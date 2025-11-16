'use client'

import { useQuery } from '@tanstack/react-query'
import { getCurrentUsage, type UsageData } from '@/lib/billing'
import { AlertCircle, TrendingUp, Database, Zap, HardDrive } from 'lucide-react'
import { formatNumber, formatCurrency, formatDate } from '@/lib/utils'

export default function BillingUsagePage() {
  const { data: usage, isLoading: loading, error, refetch } = useQuery<UsageData>({
    queryKey: ['billing', 'usage', 'current'],
    queryFn: ({ signal }) => getCurrentUsage({ signal }),
    staleTime: 60 * 1000,
  })

  if (loading) {
    return (
      <div className="p-8">
        <div className="max-w-6xl mx-auto">
          <div className="animate-pulse space-y-6">
            <div className="h-8 w-48 bg-gray-200 rounded"></div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-40 bg-gray-200 rounded-lg"></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-8">
        <div className="max-w-6xl mx-auto">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-red-600 mt-0.5" />
            <div>
              <h3 className="font-semibold text-red-900">Error Loading Usage</h3>
              <p className="text-sm text-red-700 mt-1">{(error as Error).message}</p>
              <button
                onClick={() => void refetch()}
                className="mt-3 text-sm font-medium text-red-700 hover:text-red-800"
              >
                Try Again
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (!usage) {
    return (
      <div className="p-8">
        <div className="max-w-6xl mx-auto">
          <div className="text-center py-12">
            <p className="text-gray-600">No usage data available</p>
          </div>
        </div>
      </div>
    )
  }

  const calculatePercentage = (used: number, limit: number) => {
    if (limit === 0) return 0
    return Math.min((used / limit) * 100, 100)
  }

  const getUsageColor = (percentage: number) => {
    if (percentage >= 90) return 'text-red-600'
    if (percentage >= 75) return 'text-yellow-600'
    return 'text-green-600'
  }

  const getBarColor = (percentage: number) => {
    if (percentage >= 90) return 'bg-red-500'
    if (percentage >= 75) return 'bg-yellow-500'
    return 'bg-green-500'
  }

  return (
    <div className="p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Usage & Billing</h1>
          <p className="text-gray-600 mt-2">
            Current period: {formatDate(usage.current_period.start)} - {formatDate(usage.current_period.end)}
          </p>
          <p className="text-sm text-gray-500 mt-1">
            Plan: <span className="font-semibold">{usage.subscription.plan_type}</span>
          </p>
        </div>

        {/* Usage Metrics */}
        <section aria-labelledby="usage-overview-heading" className="space-y-4">
          <div className="flex items-end justify-between">
            <h2 id="usage-overview-heading" className="text-2xl font-semibold text-gray-900">
              Usage Overview
            </h2>
            <span className="text-sm text-gray-500">
              Track how you are pacing against your included limits this period.
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Impressions */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center">
                  <TrendingUp className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">Impressions</h3>
                  <p className="text-xs text-gray-600">Ad views</p>
                </div>
              </div>
            </div>
            <div className="space-y-3">
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold text-gray-900">
                  {formatNumber(usage.current_period.impressions)}
                </span>
                <span className="text-sm text-gray-600">
                  / {formatNumber(usage.subscription.included_impressions)}
                </span>
              </div>
              <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className={`h-full ${getBarColor(
                    calculatePercentage(
                      usage.current_period.impressions,
                      usage.subscription.included_impressions
                    )
                  )} transition-all duration-300`}
                  style={{
                    width: `${calculatePercentage(
                      usage.current_period.impressions,
                      usage.subscription.included_impressions
                    )}%`,
                  }}
                />
              </div>
              <progress
                className="sr-only"
                value={Math.min(
                  usage.current_period.impressions,
                  usage.subscription.included_impressions
                )}
                max={Math.max(usage.subscription.included_impressions, 1)}
                aria-label="Impressions usage"
              />
              <p
                className={`text-sm font-medium ${getUsageColor(
                  calculatePercentage(
                    usage.current_period.impressions,
                    usage.subscription.included_impressions
                  )
                )}`}
              >
                {calculatePercentage(
                  usage.current_period.impressions,
                  usage.subscription.included_impressions
                ).toFixed(1)}
                % used
              </p>
              {usage.overages.impressions.amount > 0 && (
                <div className="pt-3 border-t border-gray-200">
                  <p className="text-sm text-gray-600">Overage</p>
                  <p className="text-lg font-semibold text-red-600">
                    {formatNumber(usage.overages.impressions.amount)} impressions
                  </p>
                  <p className="text-sm text-gray-900">
                    {formatCurrency(usage.overages.impressions.cost)}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* API Calls */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-purple-100 flex items-center justify-center">
                  <Zap className="h-5 w-5 text-purple-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">API Calls</h3>
                  <p className="text-xs text-gray-600">Requests</p>
                </div>
              </div>
            </div>
            <div className="space-y-3">
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold text-gray-900">
                  {formatNumber(usage.current_period.api_calls)}
                </span>
                <span className="text-sm text-gray-600">
                  / {formatNumber(usage.subscription.included_api_calls)}
                </span>
              </div>
              <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className={`h-full ${getBarColor(
                    calculatePercentage(
                      usage.current_period.api_calls,
                      usage.subscription.included_api_calls
                    )
                  )} transition-all duration-300`}
                  style={{
                    width: `${calculatePercentage(
                      usage.current_period.api_calls,
                      usage.subscription.included_api_calls
                    )}%`,
                  }}
                />
              </div>
              <progress
                className="sr-only"
                value={Math.min(usage.current_period.api_calls, usage.subscription.included_api_calls)}
                max={Math.max(usage.subscription.included_api_calls, 1)}
                aria-label="API calls usage"
              />
              <p
                className={`text-sm font-medium ${getUsageColor(
                  calculatePercentage(
                    usage.current_period.api_calls,
                    usage.subscription.included_api_calls
                  )
                )}`}
              >
                {calculatePercentage(
                  usage.current_period.api_calls,
                  usage.subscription.included_api_calls
                ).toFixed(1)}
                % used
              </p>
              {usage.overages.api_calls.amount > 0 && (
                <div className="pt-3 border-t border-gray-200">
                  <p className="text-sm text-gray-600">Overage</p>
                  <p className="text-lg font-semibold text-red-600">
                    {formatNumber(usage.overages.api_calls.amount)} calls
                  </p>
                  <p className="text-sm text-gray-900">
                    {formatCurrency(usage.overages.api_calls.cost)}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Data Transfer */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-green-100 flex items-center justify-center">
                  <HardDrive className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">Data Transfer</h3>
                  <p className="text-xs text-gray-600">Bandwidth</p>
                </div>
              </div>
            </div>
            <div className="space-y-3">
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold text-gray-900">
                  {usage.current_period.data_transfer_gb.toFixed(2)} GB
                </span>
                <span className="text-sm text-gray-600">
                  / {formatNumber(usage.subscription.included_data_transfer_gb)} GB
                </span>
              </div>
              <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className={`h-full ${getBarColor(
                    calculatePercentage(
                      usage.current_period.data_transfer_gb,
                      usage.subscription.included_data_transfer_gb
                    )
                  )} transition-all duration-300`}
                  style={{
                    width: `${calculatePercentage(
                      usage.current_period.data_transfer_gb,
                      usage.subscription.included_data_transfer_gb
                    )}%`,
                  }}
                />
              </div>
              <progress
                className="sr-only"
                value={Math.min(
                  usage.current_period.data_transfer_gb,
                  usage.subscription.included_data_transfer_gb
                )}
                max={Math.max(usage.subscription.included_data_transfer_gb, 1)}
                aria-label="Data transfer usage"
              />
              <p
                className={`text-sm font-medium ${getUsageColor(
                  calculatePercentage(
                    usage.current_period.data_transfer_gb,
                    usage.subscription.included_data_transfer_gb
                  )
                )}`}
              >
                {calculatePercentage(
                  usage.current_period.data_transfer_gb,
                  usage.subscription.included_data_transfer_gb
                ).toFixed(1)}
                % used
              </p>
              {usage.overages.data_transfer.amount > 0 && (
                <div className="pt-3 border-t border-gray-200">
                  <p className="text-sm text-gray-600">Overage</p>
                  <p className="text-lg font-semibold text-red-600">
                    {usage.overages.data_transfer.amount.toFixed(2)} GB
                  </p>
                  <p className="text-sm text-gray-900">
                    {formatCurrency(usage.overages.data_transfer.cost)}
                  </p>
                </div>
              )}
            </div>
          </div>
          </div>
        </section>

        {/* Total Overage Summary */}
        {usage.overages.total_overage_cost > 0 && (
          <section aria-labelledby="usage-overage-heading" className="space-y-4">
            <h2 id="usage-overage-heading" className="text-2xl font-semibold text-yellow-900">
              Overage Summary
            </h2>
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
            <div className="flex items-start gap-4">
              <div className="h-10 w-10 rounded-lg bg-yellow-100 flex items-center justify-center flex-shrink-0">
                <AlertCircle className="h-6 w-6 text-yellow-600" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-yellow-900">Usage Overage Detected</h3>
                <p className="text-sm text-yellow-700 mt-1">
                  You have exceeded your plan limits this billing period. Additional charges will
                  appear on your next invoice.
                </p>
                <div className="mt-4 flex items-center gap-2">
                  <span className="text-sm text-yellow-700">Total overage cost:</span>
                  <span className="text-2xl font-bold text-yellow-900">
                    {formatCurrency(usage.overages.total_overage_cost)}
                  </span>
                </div>
              </div>
            </div>
            </div>
          </section>
        )}

        {/* Info Box */}
        <section aria-labelledby="usage-insights-heading" className="space-y-4">
          <h2 id="usage-insights-heading" className="text-2xl font-semibold text-blue-900">
            Usage Guidance
          </h2>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
          <div className="flex items-start gap-4">
            <Database className="h-6 w-6 text-blue-600 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-blue-900">About Usage Tracking</h3>
              <p className="text-sm text-blue-700 mt-1">
                Usage is calculated in real-time and updated every hour. Overages are billed at the
                end of each billing period. View your invoices to see detailed billing history.
              </p>
            </div>
          </div>
          </div>
        </section>
      </div>
    </div>
  )
}
