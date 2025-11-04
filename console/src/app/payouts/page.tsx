'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { payoutApi } from '@/lib/api'
import {
  DollarSign,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  Download,
  Calendar,
  CreditCard,
} from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/utils'
import type { PayoutHistory } from '@/types'

const statusConfig = {
  pending: {
    color: 'text-yellow-600 bg-yellow-50 border-yellow-200',
    icon: Clock,
    label: 'Pending',
  },
  processing: {
    color: 'text-blue-600 bg-blue-50 border-blue-200',
    icon: AlertCircle,
    label: 'Processing',
  },
  completed: {
    color: 'text-success-600 bg-success-50 border-success-200',
    icon: CheckCircle,
    label: 'Completed',
  },
  failed: {
    color: 'text-danger-600 bg-danger-50 border-danger-200',
    icon: XCircle,
    label: 'Failed',
  },
}

const methodLabels = {
  stripe: 'Stripe',
  paypal: 'PayPal',
  wire: 'Wire Transfer',
}

export default function PayoutsPage() {
  const [page, setPage] = useState(1)
  const pageSize = 20

  const { data: historyData, isLoading: loadingHistory } = useQuery({
    queryKey: ['payout-history', page],
    queryFn: async () => {
      const { data } = await payoutApi.getHistory({ page, pageSize })
      return data
    },
  })

  const { data: upcoming, isLoading: loadingUpcoming } = useQuery({
    queryKey: ['payout-upcoming'],
    queryFn: async () => {
      const { data } = await payoutApi.getUpcoming()
      return data
    },
  })

  const history = historyData?.data || []
  const hasMore = historyData?.hasMore || false

  const handleExportCSV = () => {
    const csvData = [
      ['ID', 'Scheduled Date', 'Completed Date', 'Amount', 'Status', 'Method'],
    ]
    
    if (history && history.length > 0) {
      csvData.push(...history.map((payout) => [
        payout.id,
        new Date(payout.scheduledDate).toLocaleDateString(),
        payout.completedDate ? new Date(payout.completedDate).toLocaleDateString() : 'N/A',
        `${payout.amount.toFixed(2)} ${payout.currency}`,
        payout.status,
        payout.method,
      ]))
    }
    
    if (upcoming) {
      csvData.push([])
      csvData.push(['Upcoming Payout'])
      csvData.push([
        upcoming.id,
        new Date(upcoming.scheduledDate).toLocaleDateString(),
        'Pending',
        `${upcoming.amount.toFixed(2)} ${upcoming.currency}`,
        upcoming.status,
        upcoming.method,
      ])
    }
    
    if (csvData.length === 1 && !upcoming) {
      // No data to export
      alert('No payout data available to export')
      return
    }
    
    const csvContent = csvData.map(row => row.join(',')).join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    
    link.setAttribute('href', url)
    link.setAttribute('download', `payouts-export-${new Date().toISOString().split('T')[0]}.csv`)
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
            <button onClick={handleExportCSV} className="btn btn-outline flex items-center gap-2">
              <Download className="h-4 w-4" aria-hidden={true} />
              Export CSV
            </button>
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
              <span className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium border ${statusConfig[upcoming.status].color}`}>
                {(() => {
                  const Icon = statusConfig[upcoming.status].icon
                  return <Icon className="h-4 w-4" aria-hidden={true} />
                })()}
                {statusConfig[upcoming.status].label}
              </span>
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
                  <p className="text-lg font-semibold text-gray-900">{methodLabels[upcoming.method]}</p>
                </div>
              </div>
              <div>
                <p className="text-sm text-gray-600">Expected Date</p>
                <p className="text-lg font-semibold text-gray-900 mt-1">
                  {new Date(upcoming.scheduledDate).toLocaleDateString()}
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
                      const StatusIcon = statusConfig[payout.status].icon
                      return (
                        <tr key={payout.id} className="hover:bg-gray-50">
                          <td className="px-4 py-4 text-sm text-gray-900">
                            {new Date(payout.scheduledDate).toLocaleDateString()}
                          </td>
                          <td className="px-4 py-4 text-sm font-semibold text-gray-900">
                            {formatCurrency(payout.amount, payout.currency)}
                          </td>
                          <td className="px-4 py-4 text-sm text-gray-600">
                            <div className="flex items-center gap-2">
                              <CreditCard className="h-4 w-4 text-gray-400" aria-hidden={true} />
                              {methodLabels[payout.method]}
                            </div>
                          </td>
                          <td className="px-4 py-4">
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border ${statusConfig[payout.status].color}`}
                            >
                              <StatusIcon className="h-3 w-3" aria-hidden={true} />
                              {statusConfig[payout.status].label}
                            </span>
                          </td>
                          <td className="px-4 py-4 text-sm text-gray-600">
                            {payout.completedDate
                              ? new Date(payout.completedDate).toLocaleDateString()
                              : '—'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {(page > 1 || hasMore) && (
                <div className="flex items-center justify-between mt-6 pt-6 border-t">
                  <button
                    onClick={() => setPage(Math.max(1, page - 1))}
                    disabled={page === 1}
                    className="btn btn-outline disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Previous
                  </button>
                  <span className="text-sm text-gray-600">Page {page}</span>
                  <button
                    onClick={() => setPage(page + 1)}
                    disabled={!hasMore}
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
