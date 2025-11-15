'use client'

import { useQuery } from '@tanstack/react-query'
import { payoutApi } from '@/lib/api'
import { formatCurrency } from '@/lib/utils'
import { DollarSign, Calendar, CreditCard, Clock } from 'lucide-react'
import Link from 'next/link'
import { useSession } from '@/lib/useSession'
import { PAYOUT_METHOD_LABELS, PAYOUT_STATUS_META } from '@/constants/payouts'
import type { PayoutHistory } from '@/types'

export function PayoutWidget() {
  const { user, isLoading: sessionLoading } = useSession()
  const publisherId = user?.publisherId

  const {
    data: upcomingPayout,
    isLoading,
  } = useQuery<PayoutHistory | null>({
    queryKey: ['upcoming-payout', publisherId ?? 'all'],
    enabled: !!user,
    queryFn: ({ signal }) =>
      payoutApi
        .getUpcoming({ publisherId, signal })
        .then((res) => res.data ?? null),
  })

  if (sessionLoading || !user) {
    return <PayoutWidgetSkeleton />
  }

  if (isLoading) {
    return <PayoutWidgetSkeleton />
  }

  if (!upcomingPayout) {
    return (
      <div className="card">
        <h3 className="text-lg font-semibold mb-4">Upcoming Payout</h3>
        <div className="text-center py-8 text-gray-500">
          <DollarSign className="w-12 h-12 mx-auto mb-2 opacity-50" />
          <p>No upcoming payouts</p>
          <p className="text-sm mt-1">Minimum payout threshold: $100</p>
        </div>
      </div>
    )
  }

  const statusMeta = PAYOUT_STATUS_META[upcomingPayout.status]
  const methodLabel = PAYOUT_METHOD_LABELS[upcomingPayout.method] ?? upcomingPayout.method

  const daysUntilPayout = Math.ceil(
    (new Date(upcomingPayout.scheduledDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
  )

  return (
    <div className="card">
      <h3 className="text-lg font-semibold mb-4">Upcoming Payout</h3>
      
      <div className="space-y-4">
        {/* Amount */}
        <div className="bg-gradient-to-br from-primary-50 to-primary-100 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className="w-5 h-5 text-primary-600" />
            <span className="text-sm font-medium text-primary-900">Payout Amount</span>
          </div>
          <div className="text-3xl font-bold text-primary-900">
            {formatCurrency(upcomingPayout.amount, upcomingPayout.currency)}
          </div>
        </div>

        {/* Details */}
        <div className="space-y-3">
          {/* Scheduled Date */}
          <div className="flex items-center justify-between py-2">
            <div className="flex items-center gap-2 text-gray-600">
              <Calendar className="w-4 h-4" />
              <span className="text-sm">Scheduled Date</span>
            </div>
            <div className="text-right">
              <div className="font-semibold text-gray-900">
                {new Date(upcomingPayout.scheduledDate).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric'
                })}
              </div>
              <div className="text-xs text-gray-500">
                {daysUntilPayout > 0 ? `in ${daysUntilPayout} days` : 'today'}
              </div>
            </div>
          </div>

          {/* Payment Method */}
          <div className="flex items-center justify-between py-2">
            <div className="flex items-center gap-2 text-gray-600">
              <CreditCard className="w-4 h-4" />
              <span className="text-sm">Payment Method</span>
            </div>
            <span className="badge badge-info uppercase font-semibold">
              {methodLabel}
            </span>
          </div>

          {/* Status */}
          <div className="flex items-center justify-between py-2">
            <div className="flex items-center gap-2 text-gray-600">
              <Clock className="w-4 h-4" />
              <span className="text-sm">Status</span>
            </div>
            <span
              className={`px-3 py-1 rounded-full text-xs font-semibold ${statusMeta.solidClass}`}
            >
              {statusMeta.label}
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="pt-4 border-t space-y-3">
          <Link
            href="/payouts"
            className="btn btn-primary w-full py-2.5 px-3 text-sm leading-tight text-center flex flex-wrap justify-center gap-2"
          >
            <span>View Payout</span>
            <span>History</span>
          </Link>
          <Link
            href="/settings/payouts"
            className="btn btn-outline w-full py-2.5 px-3 text-sm leading-tight text-center flex flex-wrap justify-center gap-2"
          >
            <span>Update</span>
            <span>Payment Method</span>
          </Link>
        </div>
      </div>
    </div>
  )
}

function PayoutWidgetSkeleton() {
  return (
    <div className="card">
      <div className="animate-pulse">
        <div className="h-6 bg-gray-200 rounded w-32 mb-4"></div>
        <div className="space-y-4">
          <div className="h-24 bg-gray-200 rounded-lg"></div>
          <div className="space-y-3">
            <div className="h-12 bg-gray-200 rounded"></div>
            <div className="h-12 bg-gray-200 rounded"></div>
            <div className="h-12 bg-gray-200 rounded"></div>
          </div>
          <div className="h-10 bg-gray-200 rounded"></div>
        </div>
      </div>
    </div>
  )
}
