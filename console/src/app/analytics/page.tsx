'use client'

import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { revenueApi, analyticsApi } from '@/lib/api'
import {
  BarChart3,
  TrendingUp,
  Download,
  Calendar,
  DollarSign,
  Eye,
  MousePointer,
  Zap,
} from 'lucide-react'
import { formatCurrency, formatNumber, formatPercentage } from '@/lib/utils'
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'

export default function AnalyticsPage() {
  const defaultStart = useMemo(
    () => new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    []
  )
  const today = useMemo(() => new Date().toISOString().split('T')[0], [])

  const [dateRange, setDateRange] = useState({
    startDate: defaultStart,
    endDate: today,
  })
  const [granularity, setGranularity] = useState<'hour' | 'day' | 'week' | 'month'>('day')

  const { data: timeSeries, isLoading: loadingTimeSeries } = useQuery({
    queryKey: ['revenue-timeseries', dateRange, granularity],
    queryFn: async () => {
      const { data } = await revenueApi.getTimeSeries({
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
        granularity,
      })
      return data
    },
  })

  const { data: summary, isLoading: loadingSummary } = useQuery({
    queryKey: ['revenue-summary', dateRange],
    queryFn: async () => {
      const { data } = await revenueApi.getSummary({
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
      })
      return data
    },
  })

  const handlePresetChange = (preset: string) => {
    const [start, end] = preset.split('|')
    setDateRange({ startDate: start, endDate: end })
  }

  const chartData = useMemo(() => {
    if (!timeSeries) return []
    return timeSeries.map((item) => ({
      date: new Date(item.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      revenue: item.revenue,
      impressions: item.impressions / 1000, // Scale down for chart
      clicks: item.clicks,
      ecpm: item.ecpm,
      fillRate: item.fillRate * 100,
    }))
  }, [timeSeries])

  const handleExportReport = () => {
    if (!timeSeries || !summary) return
    
    const csvData = [
      ['Date', 'Revenue', 'Impressions', 'Clicks', 'eCPM', 'Fill Rate (%)'],
      ...timeSeries.map((item) => [
        new Date(item.date).toLocaleDateString(),
        item.revenue.toFixed(2),
        item.impressions.toString(),
        item.clicks.toString(),
        item.ecpm.toFixed(2),
        (item.fillRate * 100).toFixed(2),
      ]),
      [],
      ['Summary'],
      ['Total Revenue', summary.totalRevenue.toFixed(2)],
      ['Total Impressions', summary.totalImpressions.toString()],
      ['Total Clicks', summary.totalClicks.toString()],
      ['Average eCPM', summary.averageEcpm.toFixed(2)],
    ]
    
    const csvContent = csvData.map(row => row.join(',')).join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    
    link.setAttribute('href', url)
    link.setAttribute('download', `analytics-report-${dateRange.startDate}-to-${dateRange.endDate}.csv`)
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-lg bg-primary-50 text-primary-600 flex items-center justify-center">
                <BarChart3 className="h-6 w-6" aria-hidden={true} />
              </div>
              <div>
                <p className="text-sm font-medium text-primary-600">Insights</p>
                <h1 className="text-3xl font-semibold text-gray-900 tracking-tight">Analytics</h1>
                <p className="text-sm text-gray-600 mt-1">
                  Deep dive into revenue trends, performance metrics, and optimization opportunities.
                </p>
              </div>
            </div>
            <button onClick={handleExportReport} className="btn btn-outline flex items-center gap-2">
              <Download className="h-4 w-4" aria-hidden={true} />
              Export Report
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Date range controls */}
        <div className="card">
          <div className="flex flex-col md:flex-row md:items-center gap-4">
            <div className="flex-1 grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="startDate" className="label">
                  Start Date
                </label>
                <input
                  id="startDate"
                  type="date"
                  className="input"
                  value={dateRange.startDate}
                  onChange={(e) => setDateRange({ ...dateRange, startDate: e.target.value })}
                />
              </div>
              <div>
                <label htmlFor="endDate" className="label">
                  End Date
                </label>
                <input
                  id="endDate"
                  type="date"
                  className="input"
                  value={dateRange.endDate}
                  onChange={(e) => setDateRange({ ...dateRange, endDate: e.target.value })}
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() =>
                  handlePresetChange(
                    `${new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]}|${today}`
                  )
                }
                className="btn btn-outline text-sm"
              >
                Last 7 Days
              </button>
              <button
                onClick={() =>
                  handlePresetChange(
                    `${new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]}|${today}`
                  )
                }
                className="btn btn-outline text-sm"
              >
                Last 30 Days
              </button>
            </div>
          </div>
        </div>

        {/* Summary metrics */}
        {loadingSummary ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="card animate-pulse">
                <div className="h-4 bg-gray-200 rounded w-1/2 mb-3" />
                <div className="h-8 bg-gray-200 rounded w-3/4" />
              </div>
            ))}
          </div>
        ) : summary ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="card">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium text-gray-600">Total Revenue</p>
                <DollarSign className="h-5 w-5 text-gray-400" aria-hidden={true} />
              </div>
              <p className="text-2xl font-bold text-gray-900">{formatCurrency(summary.totalRevenue)}</p>
              {summary.revenueChangePercent !== undefined && (
                <p
                  className={`text-xs mt-1 flex items-center gap-1 ${
                    summary.revenueChangePercent >= 0 ? 'text-success-600' : 'text-danger-600'
                  }`}
                >
                  <TrendingUp
                    className={`h-3 w-3 ${summary.revenueChangePercent < 0 ? 'rotate-180' : ''}`}
                    aria-hidden={true}
                  />
                  {formatPercentage(Math.abs(summary.revenueChangePercent))} vs prev period
                </p>
              )}
            </div>

            <div className="card">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium text-gray-600">Impressions</p>
                <Eye className="h-5 w-5 text-gray-400" aria-hidden={true} />
              </div>
              <p className="text-2xl font-bold text-gray-900">{formatNumber(summary.totalImpressions)}</p>
              {summary.impressionsChangePercent !== undefined && (
                <p
                  className={`text-xs mt-1 flex items-center gap-1 ${
                    summary.impressionsChangePercent >= 0 ? 'text-success-600' : 'text-danger-600'
                  }`}
                >
                  <TrendingUp
                    className={`h-3 w-3 ${summary.impressionsChangePercent < 0 ? 'rotate-180' : ''}`}
                    aria-hidden={true}
                  />
                  {formatPercentage(Math.abs(summary.impressionsChangePercent))} vs prev period
                </p>
              )}
            </div>

            <div className="card">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium text-gray-600">Avg eCPM</p>
                <Zap className="h-5 w-5 text-gray-400" aria-hidden={true} />
              </div>
              <p className="text-2xl font-bold text-gray-900">{formatCurrency(summary.averageEcpm)}</p>
              {summary.ecpmChangePercent !== undefined && (
                <p
                  className={`text-xs mt-1 flex items-center gap-1 ${
                    summary.ecpmChangePercent >= 0 ? 'text-success-600' : 'text-danger-600'
                  }`}
                >
                  <TrendingUp
                    className={`h-3 w-3 ${summary.ecpmChangePercent < 0 ? 'rotate-180' : ''}`}
                    aria-hidden={true}
                  />
                  {formatPercentage(Math.abs(summary.ecpmChangePercent))} vs prev period
                </p>
              )}
            </div>

            <div className="card">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium text-gray-600">Fill Rate</p>
                <MousePointer className="h-5 w-5 text-gray-400" aria-hidden={true} />
              </div>
              <p className="text-2xl font-bold text-gray-900">{formatPercentage(summary.averageFillRate)}</p>
              {summary.fillRateChangePercent !== undefined && (
                <p
                  className={`text-xs mt-1 flex items-center gap-1 ${
                    summary.fillRateChangePercent >= 0 ? 'text-success-600' : 'text-danger-600'
                  }`}
                >
                  <TrendingUp
                    className={`h-3 w-3 ${summary.fillRateChangePercent < 0 ? 'rotate-180' : ''}`}
                    aria-hidden={true}
                  />
                  {formatPercentage(Math.abs(summary.fillRateChangePercent))} vs prev period
                </p>
              )}
            </div>
          </div>
        ) : null}

        {/* Revenue over time */}
        <div className="card">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-gray-900">Revenue Trend</h2>
            <div className="flex gap-2">
              {(['day', 'week', 'month'] as const).map((g) => (
                <button
                  key={g}
                  onClick={() => setGranularity(g)}
                  className={`px-3 py-1 rounded text-sm font-medium ${
                    granularity === g ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {g.charAt(0).toUpperCase() + g.slice(1)}
                </button>
              ))}
            </div>
          </div>
          {loadingTimeSeries ? (
            <div className="h-80 flex items-center justify-center">
              <div className="animate-pulse text-gray-400">Loading chart...</div>
            </div>
          ) : chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={320}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="date" stroke="#6b7280" style={{ fontSize: '12px' }} />
                <YAxis stroke="#6b7280" style={{ fontSize: '12px' }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'white',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    padding: '12px',
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '14px' }} />
                <Line
                  type="monotone"
                  dataKey="revenue"
                  stroke="#2563eb"
                  strokeWidth={2}
                  name="Revenue ($)"
                  dot={{ fill: '#2563eb', r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-80 flex items-center justify-center text-gray-500">
              No data available for selected period
            </div>
          )}
        </div>

        {/* Performance metrics */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="card">
            <h2 className="text-lg font-semibold text-gray-900 mb-6">eCPM & Fill Rate</h2>
            {loadingTimeSeries ? (
              <div className="h-64 flex items-center justify-center">
                <div className="animate-pulse text-gray-400">Loading chart...</div>
              </div>
            ) : chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={256}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="date" stroke="#6b7280" style={{ fontSize: '12px' }} />
                  <YAxis stroke="#6b7280" style={{ fontSize: '12px' }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'white',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      padding: '12px',
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: '14px' }} />
                  <Line
                    type="monotone"
                    dataKey="ecpm"
                    stroke="#10b981"
                    strokeWidth={2}
                    name="eCPM ($)"
                    dot={{ fill: '#10b981', r: 3 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="fillRate"
                    stroke="#f59e0b"
                    strokeWidth={2}
                    name="Fill Rate (%)"
                    dot={{ fill: '#f59e0b', r: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-64 flex items-center justify-center text-gray-500">
                No data available
              </div>
            )}
          </div>

          <div className="card">
            <h2 className="text-lg font-semibold text-gray-900 mb-6">Impressions & Clicks</h2>
            {loadingTimeSeries ? (
              <div className="h-64 flex items-center justify-center">
                <div className="animate-pulse text-gray-400">Loading chart...</div>
              </div>
            ) : chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={256}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="date" stroke="#6b7280" style={{ fontSize: '12px' }} />
                  <YAxis stroke="#6b7280" style={{ fontSize: '12px' }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'white',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      padding: '12px',
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: '14px' }} />
                  <Bar dataKey="impressions" fill="#3b82f6" name="Impressions (K)" />
                  <Bar dataKey="clicks" fill="#8b5cf6" name="Clicks" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-64 flex items-center justify-center text-gray-500">
                No data available
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
