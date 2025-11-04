'use client'

import { useQuery } from '@tanstack/react-query'
import { revenueApi } from '@/lib/api'
import { RevenueAreaChart, EcpmLineChart } from '@/components/charts/RevenueCharts'

interface DashboardChartsProps {
  dateRange: {
    startDate: string
    endDate: string
  }
}

export function DashboardCharts({ dateRange }: DashboardChartsProps) {
  const { data: revenueData, isLoading } = useQuery({
    queryKey: ['revenue-timeseries', dateRange],
    queryFn: () => revenueApi.getTimeSeries({
      startDate: dateRange.startDate,
      endDate: dateRange.endDate,
      granularity: 'day',
    }).then(res => res.data),
  })

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartSkeleton />
        <ChartSkeleton />
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Revenue Chart */}
      <div className="card">
        <h3 className="text-lg font-semibold mb-4">Revenue Trend</h3>
        <RevenueAreaChart data={revenueData || []} height={280} />
      </div>

      {/* eCPM Chart */}
      <div className="card">
        <h3 className="text-lg font-semibold mb-4">eCPM Trend</h3>
        <EcpmLineChart data={revenueData || []} height={280} />
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
