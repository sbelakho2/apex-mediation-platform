'use client'

import { useMemo, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { RefreshCcw, AlertTriangle, ArrowUpRight } from 'lucide-react'
import {
  getSalesAutomationOverview,
  type SalesAutomationOverview,
  type SalesPrincipleStat,
  type SalesFunnelStage,
  type SalesJourneyTouchpoint,
  type SalesConversionRecord,
  type SalesExperimentRecord,
  type SalesQuickAction,
} from '@/lib/admin'
import { formatCurrency, formatNumber, formatPercentage } from '@/lib/utils'

interface SummaryCardData {
  key: string
  title: string
  value: string
  change?: string
  trend?: 'up' | 'down'
  subtitle?: string
  color: string
}

const percent = (value: number) => (value > 1 ? value / 100 : value)

export default function SalesAutomationDashboard() {
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['sales-automation-overview'],
    queryFn: async ({ signal }) => {
      const response = await getSalesAutomationOverview({ signal })
      return response.data
    },
    staleTime: 5 * 60_000,
  })

  const summaryCards = useMemo(() => (data ? buildSummaryCards(data) : []), [data])

  if (isLoading) return <LoadingState />

  if (error)
    return (
      <ErrorState
        message={error instanceof Error ? error.message : 'Unable to load sales automation data'}
        onRetry={() => refetch()}
      />
    )

  if (!data) return <EmptyState onRetry={() => refetch()} />

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-primary-600">Revenue &amp; Growth</p>
            <h1 className="text-3xl font-semibold text-gray-900 mt-1">Sales Automation Dashboard</h1>
            <p className="text-sm text-gray-600 mt-2">Powered by live funnel and principle attribution data</p>
          </div>
          <div className="flex items-center gap-3">
            <p className="text-xs text-gray-500">Last updated {new Date(data.updatedAt).toLocaleString()}</p>
            <button
              onClick={() => refetch()}
              className="inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-50"
              aria-live="polite"
            >
              <RefreshCcw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} aria-hidden={true} />
              Refresh
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <SummaryGrid cards={summaryCards} />

        <SectionCard
          title="Principle Effectiveness"
          description="Conversion lift by Cialdini principle across current campaigns"
        >
          <PrinciplesList principles={data.principles} />
        </SectionCard>

        <SectionCard title="Conversion Funnel" description="Stage-by-stage performance and time-in-stage">
          <FunnelList stages={data.funnel} insight={data.insights[0]} />
        </SectionCard>

        <SectionCard title="14-Day Journey" description="Touchpoint engagement and impact ratings">
          <JourneyTable touchpoints={data.journey} />
        </SectionCard>

        <SectionCard title="Recent Conversions" description="Latest upgrades with milestone attribution">
          <ConversionsList conversions={data.conversions} />
        </SectionCard>

        <SectionCard title="Active Experiments" description="A/B tests running across sales automation journeys">
          <ExperimentsList experiments={data.experiments} />
        </SectionCard>

        <SectionCard title="Quick Actions" description="Operational shortcuts" wrap>
          <QuickActionsPanel actions={data.quickActions} />
        </SectionCard>

        {data.insights.length > 1 && <InsightPanel insights={data.insights.slice(1)} />}
      </main>
    </div>
  )
}

function buildSummaryCards(data: SalesAutomationOverview): SummaryCardData[] {
  const { summary } = data
  const trialBaseline = summary.baselineTrialRate ?? summary.trialToPaidRate
  const trialDelta = percent(summary.trialToPaidRate) * 100 - percent(trialBaseline) * 100
  const dealDelta = summary.targetDealSizeUSD ? summary.avgDealSizeUSD - summary.targetDealSizeUSD : undefined
  const timeDelta = summary.targetTimeToConvertDays ? summary.timeToConvertDays - summary.targetTimeToConvertDays : undefined

  return [
    {
      key: 'trialToPaid',
      title: 'Trial → Paid',
      value: formatPercentLabel(summary.trialToPaidRate),
      change: `${trialDelta >= 0 ? '+' : ''}${trialDelta.toFixed(1)} pts vs baseline`,
      trend: trialDelta >= 0 ? 'up' : 'down',
      subtitle: `Baseline ${formatPercentLabel(trialBaseline)}`,
      color: 'bg-emerald-50 text-emerald-700',
    },
    {
      key: 'dealSize',
      title: 'Avg Deal Size',
      value: formatCurrency(summary.avgDealSizeUSD),
      change: dealDelta != null ? `${dealDelta >= 0 ? '+' : ''}${formatCurrency(Math.abs(dealDelta))} vs target` : undefined,
      trend: dealDelta != null && dealDelta >= 0 ? 'up' : 'down',
      subtitle: summary.targetDealSizeUSD ? `Target ${formatCurrency(summary.targetDealSizeUSD)}` : 'Current period',
      color: 'bg-blue-50 text-blue-700',
    },
    {
      key: 'timeToConvert',
      title: 'Time to Convert',
      value: `${summary.timeToConvertDays.toFixed(1)} days`,
      change: timeDelta != null ? `${timeDelta >= 0 ? '+' : ''}${timeDelta.toFixed(1)} days vs target` : undefined,
      trend: timeDelta != null && timeDelta <= 0 ? 'up' : 'down',
      subtitle: summary.targetTimeToConvertDays ? `Target ${summary.targetTimeToConvertDays} days` : 'Rolling average',
      color: 'bg-purple-50 text-purple-700',
    },
    {
      key: 'activeTrials',
      title: 'Active Trials',
      value: formatNumber(summary.activeTrials, { maximumFractionDigits: 0 }),
      change:
        summary.trialWeekChange != null
          ? `${summary.trialWeekChange >= 0 ? '+' : ''}${formatNumber(summary.trialWeekChange, {
              maximumFractionDigits: 0,
            })} vs last week`
          : undefined,
      trend: summary.trialWeekChange != null && summary.trialWeekChange >= 0 ? 'up' : 'down',
      subtitle: 'Current cohort',
      color: 'bg-orange-50 text-orange-700',
    },
  ]
}

function SummaryGrid({ cards }: { cards: SummaryCardData[] }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
      {cards.map((card) => (
        <SummaryCardItem key={card.key} card={card} />
      ))}
    </div>
  )
}

function SummaryCardItem({ card }: { card: SummaryCardData }) {
  return (
    <div className="bg-white rounded-xl border shadow-sm p-5 h-full flex flex-col">
      <p className="text-sm text-gray-600 mb-1">{card.title}</p>
      <p className="text-3xl font-semibold text-gray-900">{card.value}</p>
      {card.subtitle && <p className="text-xs text-gray-500 mt-1">{card.subtitle}</p>}
      {card.change && (
        <div className={`mt-4 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ${card.color}`}>
          {card.trend === 'down' ? '↓' : '↑'} {card.change}
        </div>
      )}
    </div>
  )
}

function SectionCard({ title, description, children, wrap }: { title: string; description: string; children: ReactNode; wrap?: boolean }) {
  return (
    <section className="bg-white rounded-2xl border shadow-sm p-6">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-semibold text-gray-900">{title}</h2>
          <p className="text-sm text-gray-600 mt-1">{description}</p>
        </div>
      </div>
      <div className={wrap ? 'grid grid-cols-1 md:grid-cols-3 gap-4' : ''}>{children}</div>
    </section>
  )
}

function PrinciplesList({ principles }: { principles: SalesPrincipleStat[] }) {
  if (!principles.length) {
    return <EmptyPlaceholder message="No principle data yet" />
  }
  return (
    <div className="space-y-4">
      {principles.map((principle) => {
        const rate = Math.min(100, Math.max(0, principle.conversionRate > 1 ? principle.conversionRate : principle.conversionRate * 100))
        return (
          <div key={principle.key} className="border rounded-xl p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-base font-semibold text-gray-900 flex items-center gap-2">
                  <span aria-hidden={true}>{principle.icon ?? '•'}</span>
                  {principle.label}
                </p>
                <p className="text-sm text-gray-500">{principle.description}</p>
              </div>
              <p className="text-2xl font-bold text-gray-900">{rate.toFixed(1)}%</p>
            </div>
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden" aria-hidden={true}>
              <div className={`h-full rounded-full ${principle.color ?? 'bg-primary-500'}`} style={{ width: `${rate}%` }} />
            </div>
            <div className="flex gap-6 text-sm text-gray-600">
              <span>{formatNumber(principle.touches, { maximumFractionDigits: 0 })} touches</span>
              <span>{formatCurrency(principle.revenueUSD)} influenced</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function FunnelList({ stages, insight }: { stages: SalesFunnelStage[]; insight?: string }) {
  if (!stages.length) return <EmptyPlaceholder message="Funnel data unavailable" />
  return (
    <div className="space-y-4">
      {stages.map((stage) => {
        const percentValue = Math.min(100, Math.max(0, stage.conversionPercentage > 1 ? stage.conversionPercentage : stage.conversionPercentage * 100))
        return (
          <div key={stage.key} className="border rounded-xl p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-base font-semibold text-gray-900">{stage.name}</p>
                <p className="text-sm text-gray-500">{formatNumber(stage.count)} accounts</p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-gray-900">{percentValue.toFixed(1)}%</p>
                <p className="text-xs text-gray-500">{stage.avgDays.toFixed(1)} days in stage</p>
              </div>
            </div>
            <div className="mt-3 h-2 bg-gray-100 rounded-full overflow-hidden" aria-hidden={true}>
              <div className="h-full rounded-full bg-primary-500" style={{ width: `${percentValue}%` }} />
            </div>
            <div className="mt-3 text-sm text-gray-600">Engagement score {stage.engagementScore}</div>
          </div>
        )
      })}
      {insight && <div className="p-4 bg-emerald-50 rounded-xl text-sm text-emerald-900">💡 {insight}</div>}
    </div>
  )
}

function JourneyTable({ touchpoints }: { touchpoints: SalesJourneyTouchpoint[] }) {
  if (!touchpoints.length) return <EmptyPlaceholder message="No journey telemetry yet" />
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b text-left text-gray-500">
            <th className="py-3 pr-4">Day</th>
            <th className="py-3 pr-4">Touchpoint</th>
            <th className="py-3 pr-4">Principle</th>
            <th className="py-3 text-center">Sent</th>
            <th className="py-3 text-center">Open Rate</th>
            <th className="py-3 text-center">Click Rate</th>
            <th className="py-3 text-center">Impact</th>
          </tr>
        </thead>
        <tbody>
          {touchpoints.map((row) => (
            <tr key={`${row.day}-${row.title}`} className="border-b last:border-0">
              <td className="py-3 pr-4 font-medium text-gray-900">Day {row.day}</td>
              <td className="py-3 pr-4 text-gray-800">{row.title}</td>
              <td className="py-3 pr-4 text-gray-600">{row.principle}</td>
              <td className="py-3 text-center text-gray-900">{formatNumber(row.sent)}</td>
              <td className="py-3 text-center text-gray-900">{formatPercentLabel(row.openRate)}</td>
              <td className="py-3 text-center text-gray-900">{formatPercentLabel(row.clickRate)}</td>
              <td className="py-3 text-center">
                <span className="inline-flex items-center rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700">
                  {row.impact}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ConversionsList({ conversions }: { conversions: SalesConversionRecord[] }) {
  if (!conversions.length) return <EmptyPlaceholder message="No conversions yet" />
  return (
    <div className="space-y-4">
      {conversions.map((conversion) => {
        const probability = Math.min(100, Math.max(0, conversion.conversionProbability > 1 ? conversion.conversionProbability : conversion.conversionProbability * 100))
        return (
          <div key={conversion.company} className="border rounded-xl p-4 flex flex-wrap items-center gap-4">
            <div className="flex-1 min-w-[180px]">
              <p className="text-base font-semibold text-gray-900">{conversion.company}</p>
              <p className="text-sm text-gray-500">{conversion.principle}</p>
            </div>
            <div className="min-w-[140px]">
              <p className="text-xs text-gray-500">MRR</p>
              <p className="text-lg font-semibold text-gray-900">{formatCurrency(conversion.mrrUSD)}</p>
            </div>
            <div className="min-w-[140px]">
              <p className="text-xs text-gray-500">Days in trial</p>
              <p className="text-lg font-semibold text-gray-900">{conversion.daysInTrial}</p>
            </div>
            <div className="flex-1 min-w-[220px]">
              <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                <span>{conversion.milestonesCompleted} milestones</span>
                <span>{probability.toFixed(0)}% probability</span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden" aria-hidden={true}>
                <div className="h-full rounded-full bg-emerald-500" style={{ width: `${probability}%` }} />
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function ExperimentsList({ experiments }: { experiments: SalesExperimentRecord[] }) {
  if (!experiments.length) return <EmptyPlaceholder message="No active experiments" />
  return (
    <div className="space-y-4">
      {experiments.map((test) => (
        <div key={test.id} className="border rounded-xl p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-base font-semibold text-gray-900">{test.testName}</p>
              <p className="text-sm text-gray-600">{test.hypothesis}</p>
            </div>
            <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700">
              Winner: {test.winner}
              <ArrowUpRight className="h-3.5 w-3.5" aria-hidden={true} />
            </span>
          </div>
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-xs uppercase text-gray-500 tracking-wide">Control</p>
              <p className="text-lg font-semibold text-gray-900">{formatPercentLabel(test.controlRate)}</p>
            </div>
            <div>
              <p className="text-xs uppercase text-gray-500 tracking-wide">Variant</p>
              <p className="text-lg font-semibold text-gray-900">{formatPercentLabel(test.testRate)}</p>
            </div>
            <div>
              <p className="text-xs uppercase text-gray-500 tracking-wide">Confidence</p>
              <p className="text-lg font-semibold text-gray-900">{formatPercentLabel(test.confidence, 0)}</p>
            </div>
          </div>
          <p className="mt-4 text-sm text-gray-600">{test.recommendation}</p>
        </div>
      ))}
    </div>
  )
}

function QuickActionsPanel({ actions }: { actions: SalesQuickAction[] }) {
  if (!actions.length) return <EmptyPlaceholder message="No quick actions available" />
  return (
    <>
      {actions.map((action) => (
        <div key={action.id} className="border rounded-xl p-4 flex flex-col gap-2">
          <p className="text-base font-semibold text-gray-900 flex items-center gap-2">
            <span aria-hidden={true}>{action.icon ?? '→'}</span>
            {action.title}
          </p>
          <p className="text-sm text-gray-600 flex-1">{action.description}</p>
          {action.href ? (
            <a
              href={action.href}
              className="inline-flex items-center gap-2 text-sm font-medium text-primary-600 hover:text-primary-500"
            >
              Go to action
              <ArrowUpRight className="h-4 w-4" aria-hidden={true} />
            </a>
          ) : (
            <span className="text-xs text-gray-400">No link configured</span>
          )}
        </div>
      ))}
    </>
  )
}

function InsightPanel({ insights }: { insights: string[] }) {
  if (!insights.length) return null
  return (
    <section className="bg-blue-50 border border-blue-100 rounded-2xl p-6">
      <p className="text-sm font-semibold text-blue-900 uppercase tracking-wide mb-3">Additional Insights</p>
      <ul className="space-y-2 text-sm text-blue-900">
        {insights.map((insight) => (
          <li key={insight} className="flex gap-2">
            <span aria-hidden={true}>•</span>
            <span>{insight}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

function LoadingState() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-sm text-gray-600">Loading sales automation data…</div>
    </div>
  )
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md bg-white border rounded-2xl p-6 text-center space-y-4 shadow-sm">
        <AlertTriangle className="h-10 w-10 text-amber-500 mx-auto" aria-hidden={true} />
        <div>
          <p className="text-lg font-semibold text-gray-900">Unable to load sales dashboard</p>
          <p className="text-sm text-gray-600 mt-1">{message}</p>
        </div>
        <button
          onClick={onRetry}
          className="inline-flex items-center justify-center rounded-md bg-primary-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-primary-500"
        >
          Try again
        </button>
      </div>
    </div>
  )
}

function EmptyState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md bg-white border rounded-2xl p-6 text-center space-y-4 shadow-sm">
        <p className="text-lg font-semibold text-gray-900">No sales data yet</p>
        <p className="text-sm text-gray-600">
          We couldn&apos;t find any automation metrics. Confirm backend collectors are enabled, then refresh.
        </p>
        <button
          onClick={onRetry}
          className="inline-flex items-center justify-center rounded-md bg-primary-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-primary-500"
        >
          Refresh data
        </button>
      </div>
    </div>
  )
}

function EmptyPlaceholder({ message }: { message: string }) {
  return <div className="text-sm text-gray-500 border border-dashed rounded-xl p-6 text-center">{message}</div>
}

function formatPercentLabel(value: number, decimals = 1) {
  return formatPercentage(percent(value), decimals)
}
