'use client'

import { ArrowUpRight, ArrowDownRight } from 'lucide-react'

interface MetricCardProps {
  title: string
  value: string
  change?: number
  icon: React.ReactNode
  trend?: 'up' | 'down' | 'neutral'
}

export function MetricCard({
  title,
  value,
  change,
  icon,
  trend,
}: MetricCardProps) {
  const resolvedTrend: 'up' | 'down' | 'neutral' =
    trend ??
    (typeof change === 'number'
      ? change > 0
        ? 'up'
        : change < 0
          ? 'down'
          : 'neutral'
      : 'neutral')

  const trendColor =
    resolvedTrend === 'up'
      ? 'text-success-600'
      : resolvedTrend === 'down'
        ? 'text-danger-600'
        : 'text-gray-500'

  return (
    <div className="card">
      <div className="flex items-start justify-between mb-3">
        <div>
          <span className="text-sm font-medium text-gray-500 uppercase tracking-wide block">
            {title}
          </span>
          <span className="mt-2 text-3xl font-semibold text-gray-900 leading-tight block">
            {value}
          </span>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-50 text-primary-600">
          {icon}
        </div>
      </div>

      {typeof change === 'number' && (
        <div className={`flex items-center text-sm font-medium ${trendColor}`}>
          {resolvedTrend === 'up' && <ArrowUpRight className="mr-1 h-4 w-4" aria-hidden="true" />}
          {resolvedTrend === 'down' && <ArrowDownRight className="mr-1 h-4 w-4" aria-hidden="true" />}
          <span>
            {resolvedTrend === 'neutral'
              ? 'No change vs last period'
              : `${Math.abs(change).toFixed(1)}% vs last period`}
          </span>
        </div>
      )}
    </div>
  )
}

interface MetricSkeletonProps {
  count?: number
}

export function MetricCardSkeleton({ count = 4 }: MetricSkeletonProps) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="card">
          <div className="animate-pulse">
            <div className="flex items-center justify-between mb-2">
              <div className="h-4 bg-gray-200 rounded w-20"></div>
              <div className="h-8 w-8 bg-gray-200 rounded-lg"></div>
            </div>
            <div className="h-8 bg-gray-200 rounded w-24 mb-2"></div>
            <div className="h-4 bg-gray-200 rounded w-28"></div>
          </div>
        </div>
      ))}
    </>
  )
}
