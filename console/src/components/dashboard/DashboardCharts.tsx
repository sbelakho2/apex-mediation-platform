'use client'

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { revenueApi } from '@/lib/api'
import { getLocale } from '@/lib/utils'
import { RevenueAreaChart, EcpmLineChart } from '@/components/charts/RevenueCharts'

interface DashboardChartsProps {
  dateRange: {
    startDate: string
    endDate: string
  }
  currency?: string
}

type RevenueTimeseriesPoint = {
  date: string
  revenue: number
  impressions: number
  clicks: number
  ecpm: number
  fillRate: number
}

export function DashboardCharts({ dateRange, currency = 'USD' }: DashboardChartsProps) {
  const locale = useMemo(() => getLocale(), [])
  const timeZone = 'UTC'

  const { axisFormatter, tooltipFormatter } = useMemo(() => {
    const axis = new Intl.DateTimeFormat(locale, {
      month: 'short',
      day: 'numeric',
      timeZone,
    })
    const tooltip = new Intl.DateTimeFormat(locale, {
      dateStyle: 'medium',
      timeZone,
    })

    return {
      axisFormatter: (value: string) => axis.format(new Date(value)),
      tooltipFormatter: (value: string) => tooltip.format(new Date(value)),
    }
  }, [locale, timeZone])

  const {
    data: revenueData = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery<RevenueTimeseriesPoint[]>({
    queryKey: ['revenue-timeseries', dateRange.startDate, dateRange.endDate],
    queryFn: ({ signal }) =>
      revenueApi
        .getTimeSeries({
          startDate: dateRange.startDate,
          endDate: dateRange.endDate,
          granularity: 'day',
          signal,
        })
        .then((res) => res.data),
    placeholderData: (previousData) => previousData,
    staleTime: 60_000,
    gcTime: 300_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })
  const errorMessage = error instanceof Error ? error.message : 'Unable to load revenue metrics.'
  const hasData = revenueData.length > 0

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartSkeleton />
        <ChartSkeleton />
      </div>
    )
  }

  if (isError) {
    return (
      <div className="card border-danger-200 bg-danger-50 text-danger-800" role="alert" aria-live="polite">
        <div className="flex flex-col gap-3">
          <div>
            <h3 className="text-lg font-semibold">Unable to load revenue charts</h3>
            <p className="text-sm">{errorMessage}</p>
          </div>
          <div>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => refetch()}>
              Retry fetching data
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (!hasData) {
    return (
      <div className="card bg-white border border-dashed border-gray-200" role="status" aria-live="polite">
        <div className="flex flex-col gap-3 text-center py-10">
          <h3 className="text-lg font-semibold text-gray-900">No revenue data yet</h3>
          <p className="text-sm text-gray-600">
            Try adjusting the selected date range or refresh the dashboard once new revenue has been recorded.
          </p>
          <div className="flex justify-center">
            <button type="button" className="btn btn-outline btn-sm" onClick={() => refetch()}>
              Refresh data
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Revenue Chart */}
      <div className="card">
        <h3 className="text-lg font-semibold mb-4">Revenue Trend</h3>
        <RevenueAreaChart
          data={revenueData}
          height={280}
          locale={locale}
          currency={currency}
          timeZone={timeZone}
          formatDateLabel={axisFormatter}
          formatTooltipLabel={tooltipFormatter}
        />
      </div>

      {/* eCPM Chart */}
      <div className="card">
        <h3 className="text-lg font-semibold mb-4">eCPM Trend</h3>
        <EcpmLineChart
          data={revenueData}
          height={280}
          locale={locale}
          currency={currency}
          timeZone={timeZone}
          formatDateLabel={axisFormatter}
          formatTooltipLabel={tooltipFormatter}
        />
      </div>
    </div>
  )
}

function ChartSkeleton() {
  return (
    <div className="card">
      <div className="animate-pulse">
        <div className="h-6 bg-gray-200 rounded w-32 mb-4"></div>
        <div className="h-64 bg-gray-200 rounded"></div>
      </div>
    </div>
  )
}
