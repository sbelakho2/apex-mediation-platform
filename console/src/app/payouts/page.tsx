'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { payoutApi } from '@/lib/api'
import {
  DollarSign,
  Clock,
  Download,
  Calendar,
  CreditCard,
} from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/utils'
import type { PaginatedResponse, PayoutHistory } from '@/types'
import { useSession } from '@/lib/useSession'
import type { Role } from '@/lib/rbac'
import { PAYOUT_METHOD_LABELS, PAYOUT_STATUS_META } from '@/constants/payouts'

const PAYOUT_ALLOWED_ROLES: Role[] = ['admin', 'publisher']

const escapeCsvValue = (value: string | number | null | undefined) => {
  if (value === null || typeof value === 'undefined') return ''
  const stringValue = String(value)
  if (/[",\n]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`
  }
  return stringValue
}

export default function PayoutsPage() {
  const router = useRouter()
  const { user, isLoading: sessionLoading } = useSession()
  const [page, setPage] = useState(1)
  const [exportError, setExportError] = useState<string | null>(null)
  const pageSize = 20
  const locale = typeof navigator !== 'undefined' ? navigator.language : 'en-US'
  const publisherId = user?.publisherId

  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      }),
    [locale]
  )

  const formatCsvDate = useCallback((value: string) => dateFormatter.format(new Date(value)), [
    dateFormatter,
  ])

  const formatCsvCurrency = useCallback(
    (amount: number, currency: string) =>
      new Intl.NumberFormat(locale, { style: 'currency', currency }).format(amount),
    [locale]
  )

  const userRole = (user?.role ?? 'publisher') as Role
  const canView = !!user && PAYOUT_ALLOWED_ROLES.includes(userRole)

  useEffect(() => {
    if (!sessionLoading && !user) {
      router.replace('/login')
    }
  }, [sessionLoading, user, router])

  useEffect(() => {
    if (!sessionLoading && user && !canView) {
      router.replace('/403')
    }
  }, [sessionLoading, user, canView, router])

  const {
    data: historyData,
    isLoading: loadingHistory,
  } = useQuery<PaginatedResponse<PayoutHistory>>({
    queryKey: ['payout-history', page, publisherId],
    enabled: canView,
    queryFn: async ({ signal }) => {
      const { data } = await payoutApi.getHistory({ page, pageSize, publisherId, signal })
      return data
    },
  })

  const {
    data: upcoming,
    isLoading: loadingUpcoming,
  } = useQuery<PayoutHistory | null>({
    queryKey: ['payout-upcoming', publisherId],
    enabled: canView,
    queryFn: async ({ signal }) => {
      const { data } = await payoutApi.getUpcoming({ publisherId, signal })
      return data
    },
  })

  const history = useMemo<PayoutHistory[]>(() => historyData?.data ?? [], [historyData])
  const hasMore = historyData?.hasMore || false
  const totalPages = useMemo(() => {
    if (historyData?.total) {
      const size = historyData.pageSize || pageSize
      return Math.max(1, Math.ceil(historyData.total / size))
    }
    return hasMore ? page + 1 : historyData ? page : null
  }, [hasMore, historyData, page, pageSize])
  const canGoNext = totalPages ? page < totalPages : hasMore
  const canGoPrev = page > 1

  const handleExportCSV = useCallback(() => {
    if ((!history || history.length === 0) && !upcoming) {
      setExportError('No payout data available to export yet.')
      return
    }

    try {
      const rows: string[][] = [
        ['ID', 'Scheduled Date', 'Completed Date', 'Amount', 'Status', 'Method'],
      ]

      history.forEach((payout) => {
        const statusMeta = PAYOUT_STATUS_META[payout.status]
        const methodLabel = PAYOUT_METHOD_LABELS[payout.method] ?? payout.method
        rows.push([
          payout.id,
          formatCsvDate(payout.scheduledDate),
          payout.completedDate ? formatCsvDate(payout.completedDate) : '—',
          formatCsvCurrency(payout.amount, payout.currency),
          statusMeta.label,
          methodLabel,
        ])
      })

      if (upcoming) {
        const upcomingStatus = PAYOUT_STATUS_META[upcoming.status]
        const methodLabel = PAYOUT_METHOD_LABELS[upcoming.method] ?? upcoming.method
        rows.push([])
        rows.push(['Upcoming Payout'])
        rows.push([
          upcoming.id,
          formatCsvDate(upcoming.scheduledDate),
          'Pending',
          formatCsvCurrency(upcoming.amount, upcoming.currency),
          upcomingStatus.label,
          methodLabel,
        ])
      }

      const csvContent = rows.map((row) => row.map(escapeCsvValue).join(',')).join('\r\n')
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)

      const link = document.createElement('a')
      link.href = url
      link.download = `payouts-export-${new Date().toISOString().split('T')[0]}.csv`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
      setExportError(null)
    } catch (error) {
      setExportError('Unable to export payouts right now. Please try again.')
    }
  }, [formatCsvCurrency, formatCsvDate, history, upcoming])

  if (sessionLoading) {
    return (
      <div className="p-8">
        <div className="max-w-4xl mx-auto">
          <div className="animate-pulse space-y-4" role="status" aria-live="polite">
            <div className="h-8 bg-gray-200 rounded w-1/3" />
            <div className="h-48 bg-gray-200 rounded" />
          </div>
        </div>
      </div>
    )
  }

  if (!canView) {
    return (
      <div className="p-8">
        <div className="max-w-4xl mx-auto">
          <div className="bg-white border border-gray-200 rounded-lg p-6" role="alert">
            <h2 className="text-lg font-semibold text-gray-900">Access restricted</h2>
            <p className="text-sm text-gray-600 mt-2">
              You do not have permission to view payouts. Contact an administrator if you believe this is a mistake.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-lg bg-primary-50 text-primary-600 flex items-center justify-center">
                <DollarSign className="h-6 w-6" aria-hidden={true} />
              </div>
              <div>
                <p className="text-sm font-medium text-primary-600">Finance</p>
                <h1 className="text-3xl font-semibold text-gray-900 tracking-tight">Payouts</h1>
                <p className="text-sm text-gray-600 mt-1">
                  Track payment history and upcoming scheduled payouts.
                </p>
              </div>
            </div>
            <div className="flex flex-col items-end">
              <button
                type="button"
                onClick={handleExportCSV}
                className="btn btn-outline flex items-center gap-2"
              >
                <Download className="h-4 w-4" aria-hidden={true} />
                Export CSV
              </button>
              {exportError && (
                <p className="text-sm text-red-600 mt-2" role="alert">
                  {exportError}
                </p>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Upcoming payout */}
        {loadingUpcoming ? (
          <div className="card animate-pulse">
            <div className="h-6 bg-gray-200 rounded w-1/3 mb-4" />
            <div className="h-20 bg-gray-200 rounded" />
          </div>
        ) : upcoming ? (
          <div className="card bg-gradient-to-br from-primary-50 to-white border-primary-200">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                  <Calendar className="h-5 w-5 text-primary-600" aria-hidden={true} />
                  Next Scheduled Payout
                </h2>
                <p className="text-sm text-gray-600 mt-1">
                  Funds will be sent on {formatDate(upcoming.scheduledDate)}
                </p>
              </div>
              {(() => {
                const statusMeta = PAYOUT_STATUS_META[upcoming.status]
                const Icon = statusMeta.icon
                return (
                  <span
                    className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium border ${statusMeta.subtleClass}`}
                  >
                    <Icon className="h-4 w-4" aria-hidden={true} />
                    {statusMeta.label}
                  </span>
                )
              })()}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 p-4 bg-white rounded-lg border">
              <div>
                <p className="text-sm text-gray-600">Amount</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">
                  {formatCurrency(upcoming.amount, upcoming.currency)}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Payment Method</p>
                <div className="flex items-center gap-2 mt-1">
                  <CreditCard className="h-5 w-5 text-gray-400" aria-hidden={true} />
                  <p className="text-lg font-semibold text-gray-900">
                    {PAYOUT_METHOD_LABELS[upcoming.method] ?? upcoming.method}
                  </p>
                </div>
              </div>
              <div>
                <p className="text-sm text-gray-600">Expected Date</p>
                <p className="text-lg font-semibold text-gray-900 mt-1">
                  {formatDate(upcoming.scheduledDate)}
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="card text-center py-12">
            <Calendar className="h-12 w-12 text-gray-400 mx-auto mb-3" aria-hidden={true} />
            <p className="text-sm text-gray-600">No upcoming payouts scheduled</p>
            <p className="text-xs text-gray-500 mt-1">Payments are issued when you reach the minimum threshold</p>
          </div>
        )}

        {/* Payment history */}
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Payment History</h2>

          {loadingHistory ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="p-4 border rounded-lg animate-pulse">
                  <div className="flex items-center gap-4">
                    <div className="h-10 w-10 bg-gray-200 rounded-full" />
                    <div className="flex-1 space-y-2">
                      <div className="h-4 bg-gray-200 rounded w-1/3" />
                      <div className="h-3 bg-gray-200 rounded w-1/2" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : history.length === 0 ? (
            <div className="text-center py-12">
              <DollarSign className="h-12 w-12 text-gray-400 mx-auto mb-3" aria-hidden={true} />
              <p className="text-sm text-gray-600">No payment history yet</p>
              <p className="text-xs text-gray-500 mt-1">Your first payout will appear here once processed</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-y">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                        Date
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                        Amount
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                        Method
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                        Completed
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {history.map((payout) => {
                      const statusMeta = PAYOUT_STATUS_META[payout.status]
                      const StatusIcon = statusMeta.icon
                      return (
                        <tr key={payout.id} className="hover:bg-gray-50">
                          <td className="px-4 py-4 text-sm text-gray-900">
                            {formatDate(payout.scheduledDate)}
                          </td>
                          <td className="px-4 py-4 text-sm font-semibold text-gray-900">
                            {formatCurrency(payout.amount, payout.currency)}
                          </td>
                          <td className="px-4 py-4 text-sm text-gray-600">
                            <div className="flex items-center gap-2">
                              <CreditCard className="h-4 w-4 text-gray-400" aria-hidden={true} />
                              {PAYOUT_METHOD_LABELS[payout.method] ?? payout.method}
                            </div>
                          </td>
                          <td className="px-4 py-4">
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border ${statusMeta.subtleClass}`}
                            >
                              <StatusIcon className="h-3 w-3" aria-hidden={true} />
                              {statusMeta.label}
                            </span>
                          </td>
                          <td className="px-4 py-4 text-sm text-gray-600">
                            {payout.completedDate ? formatDate(payout.completedDate) : '—'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {(canGoPrev || canGoNext) && (
                <div className="flex items-center justify-between mt-6 pt-6 border-t">
                  <button
                    onClick={() => setPage(Math.max(1, page - 1))}
                    disabled={!canGoPrev}
                    className="btn btn-outline disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Previous
                  </button>
                  <span className="text-sm text-gray-600">
                    Page {page}
                    {totalPages ? ` of ${totalPages}` : ''}
                  </span>
                  <button
                    onClick={() => setPage((prev) => (totalPages ? Math.min(totalPages, prev + 1) : prev + 1))}
                    disabled={!canGoNext}
                    className="btn btn-outline disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Next
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  )
}
