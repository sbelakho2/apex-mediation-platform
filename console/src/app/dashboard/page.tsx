'use client'

import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { useQuery } from '@tanstack/react-query'
import { useMemo, useState, type ChangeEvent } from 'react'
import { revenueApi } from '@/lib/api'
import { formatCurrency, formatNumber, formatPercentage } from '@/lib/utils'
import { MetricCard, MetricCardSkeleton } from '@/components/dashboard/MetricCard'
import { DashboardCharts } from '@/components/dashboard/DashboardCharts'
import { FraudWidget } from '@/components/dashboard/FraudWidget'
import { PayoutWidget } from '@/components/dashboard/PayoutWidget'
import {
  CalendarRange,
  DollarSign,
  Eye,
  MousePointer,
  TrendingUp,
  Download,
  PlusCircle,
  Settings2,
  BarChart3,
  CreditCard,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export default function DashboardPage() {
  const { data: session } = useSession()
  const defaultStart = useMemo(() => new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], [])
  const today = useMemo(() => new Date().toISOString().split('T')[0], [])

  const [dateRange, setDateRange] = useState({
    startDate: defaultStart,
    endDate: today,
  })

  const { data: revenueSummary, isLoading: loadingRevenue } = useQuery({
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

  const handlePresetSelect = (event: ChangeEvent<HTMLSelectElement>) => {
    handlePresetChange(event.target.value)
  }

  const handleExportCSV = () => {
    if (!revenueSummary) return
    
    const csvData = [
      ['Metric', 'Value'],
      ['Total Revenue', revenueSummary.totalRevenue.toFixed(2)],
      ['Total Impressions', revenueSummary.totalImpressions.toString()],
      ['Total Clicks', revenueSummary.totalClicks.toString()],
      ['Average eCPM', revenueSummary.averageEcpm.toFixed(2)],
      ['Average Fill Rate', (revenueSummary.averageFillRate * 100).toFixed(2) + '%'],
      ['Date Range', `${dateRange.startDate} to ${dateRange.endDate}`],
    ]
    
    const csvContent = csvData.map(row => row.join(',')).join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    
    link.setAttribute('href', url)
    link.setAttribute('download', `dashboard-export-${dateRange.startDate}-to-${dateRange.endDate}.csv`)
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const presets = useMemo(() => {
    const now = new Date()
    const format = (date: Date) => date.toISOString().split('T')[0]

    const createPreset = (days: number) => `${format(new Date(now.getTime() - days * 24 * 60 * 60 * 1000))}|${format(now)}`

    return {
      last7: createPreset(7),
      last30: createPreset(30),
      last90: createPreset(90),
    }
  }, [])

  const revenueChange = revenueSummary?.revenueChangePercent ?? 12.5
  const impressionsChange = revenueSummary?.impressionsChangePercent ?? 8.2
  const ecpmChange = revenueSummary?.ecpmChangePercent ?? -3.1
  const fillRateChange = revenueSummary?.fillRateChangePercent ?? 5.7

  const ecpmTrend: 'up' | 'down' | 'neutral' =
    ecpmChange === 0 ? 'neutral' : ecpmChange > 0 ? 'up' : 'down'

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white/90 backdrop-blur border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-primary-600">Performance Overview</p>
              <h1 className="text-3xl font-semibold text-gray-900 tracking-tight">Dashboard</h1>
              <p className="text-sm text-gray-600 mt-1">
                Welcome back{session?.user?.name ? `, ${session.user.name}` : ''}. Stay on top of your monetization pulse.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <CalendarRange className="w-5 h-5 text-gray-500" aria-hidden="true" />
                <select
                  aria-label="Select date range"
                  value={`${dateRange.startDate}|${dateRange.endDate}`}
                  onChange={handlePresetSelect}
                  className="input text-sm w-48"
                >
                  <option value={presets.last7}>Last 7 days</option>
                  <option value={presets.last30}>Last 30 days</option>
                  <option value={presets.last90}>Last 90 days</option>
                </select>
              </div>
              <button type="button" onClick={handleExportCSV} className="btn btn-outline flex items-center gap-2">
                <Download className="w-4 h-4" aria-hidden="true" />
                Export CSV
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-10">
        <section>
          <h2 className="sr-only">Key performance indicators</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {loadingRevenue ? (
              <MetricCardSkeleton count={4} />
            ) : (
              <>
                <MetricCard
                  title="Total Revenue"
                  value={formatCurrency(revenueSummary?.totalRevenue || 0)}
                  change={revenueChange}
                  icon={<DollarSign className="w-5 h-5" />}
                />
                <MetricCard
                  title="Impressions"
                  value={formatNumber(revenueSummary?.totalImpressions || 0)}
                  change={impressionsChange}
                  icon={<Eye className="w-5 h-5" />}
                />
                <MetricCard
                  title="eCPM"
                  value={formatCurrency(revenueSummary?.averageEcpm || 0)}
                  change={ecpmChange}
                  icon={<TrendingUp className="w-5 h-5" />}
                  trend={ecpmTrend}
                />
                <MetricCard
                  title="Fill Rate"
                  value={formatPercentage(revenueSummary?.averageFillRate || 0)}
                  change={fillRateChange}
                  icon={<MousePointer className="w-5 h-5" />}
                />
              </>
            )}
          </div>
        </section>

        <section className="space-y-6">
          <h2 className="text-xl font-semibold text-gray-900">Revenue Intelligence</h2>
          <DashboardCharts dateRange={dateRange} />
        </section>

        <section>
          <h2 className="sr-only">Operational insights</h2>
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <FraudWidget publisherId={session?.user?.publisherId || ''} />
            <PayoutWidget />
            <QuickActionsPanel />
          </div>
        </section>
      </main>
    </div>
  )
}

type QuickAction = {
  label: string
  href: string
  icon: LucideIcon
}

const quickActions: QuickAction[] = [
  {
    label: 'Create Placement',
    href: '/placements/new',
    icon: PlusCircle,
  },
  {
    label: 'Configure Adapters',
    href: '/adapters',
    icon: Settings2,
  },
  {
    label: 'View Analytics',
    href: '/analytics',
    icon: BarChart3,
  },
  {
    label: 'Update Payment Method',
    href: '/settings/payouts',
    icon: CreditCard,
  },
]

function QuickActionsPanel() {
  return (
    <div className="card h-full">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">Quick Actions</h3>
        <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">Shortcuts</span>
      </div>
      <div className="space-y-4">
        {quickActions.map((action) => {
          const Icon = action.icon
          return (
            <Link
              key={action.label}
              href={action.href}
              className="btn btn-outline w-full flex items-start sm:items-center gap-3 py-2.5 text-sm text-left"
            >
              <Icon className="w-4 h-4 text-primary-600 mt-0.5 sm:mt-0" aria-hidden="true" />
              <span className="font-medium text-gray-700 break-words leading-tight">
                {action.label}
              </span>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
