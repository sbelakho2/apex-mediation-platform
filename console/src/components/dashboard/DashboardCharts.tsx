'use client'

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { revenueApi } from '@/lib/api'
import { RevenueAreaChart, EcpmLineChart } from '@/components/charts/RevenueCharts'

interface DashboardChartsProps {
  dateRange: {
    startDate: string
    endDate: string
  }
}

type RevenueTimeseriesPoint = {
  date: string
  revenue: number
  impressions: number
  clicks: number
  ecpm: number
  fillRate: number
}

export function DashboardCharts({ dateRange }: DashboardChartsProps) {
  const rangeKey = `${dateRange.startDate}:${dateRange.endDate}`

  const { axisFormatter, tooltipFormatter } = useMemo(() => {
    const locale = typeof navigator !== 'undefined' ? navigator.language : 'en-US'
    const axis = new Intl.DateTimeFormat(locale, {
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    })
    const tooltip = new Intl.DateTimeFormat(locale, {
      dateStyle: 'medium',
      timeZone: 'UTC',
    })

    return {
      axisFormatter: (value: string) => axis.format(new Date(value)),
      tooltipFormatter: (value: string) => tooltip.format(new Date(value)),
    }
  }, [])

  const {
    data: revenueData = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery<RevenueTimeseriesPoint[]>({
    queryKey: ['revenue-timeseries', rangeKey],
    queryFn: () =>
      revenueApi
        .getTimeSeries({
          startDate: dateRange.startDate,
          endDate: dateRange.endDate,
          granularity: 'day',
        })
        .then((res) => res.data),
    placeholderData: (previousData) => previousData,
  })
  const errorMessage = error instanceof Error ? error.message : 'Unable to load revenue metrics.'

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
      <div className="card border-danger-200 bg-danger-50 text-danger-800">
        <h3 className="text-lg font-semibold mb-2">Unable to load revenue charts</h3>
        <p className="text-sm mb-4">{errorMessage}</p>
        <button type="button" className="btn btn-outline btn-sm" onClick={() => refetch()}>
          Try again
        </button>
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
