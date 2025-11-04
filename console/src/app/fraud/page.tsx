'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fraudApi } from '@/lib/api'
import { useSession } from 'next-auth/react'
import {
  ShieldAlert,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Shield,
  Activity,
  Ban,
  Flag,
  Eye,
} from 'lucide-react'
import { formatNumber, formatPercentage } from '@/lib/utils'
import type { FraudAlert, FraudStats } from '@/types'

const severityColors = {
  low: 'text-blue-600 bg-blue-50 border-blue-200',
  medium: 'text-yellow-600 bg-yellow-50 border-yellow-200',
  high: 'text-orange-600 bg-orange-50 border-orange-200',
  critical: 'text-danger-600 bg-danger-50 border-danger-200',
}

const alertTypeLabels = {
  givt: 'General Invalid Traffic',
  sivt: 'Sophisticated Invalid Traffic',
  ml_fraud: 'ML-Based Fraud',
  anomaly: 'Anomaly Detected',
}

export default function FraudPage() {
  const { data: session } = useSession()
  const publisherId = session?.user?.publisherId || 'demo-pub-1'
  const [timeWindow, setTimeWindow] = useState<'1h' | '24h' | '7d' | '30d'>('24h')

  const { data: stats, isLoading: loadingStats } = useQuery({
    queryKey: ['fraud-stats', publisherId, timeWindow],
    queryFn: async () => {
      const { data } = await fraudApi.getStats(publisherId, { window: timeWindow })
      return data
    },
  })

  const { data: alertsData, isLoading: loadingAlerts } = useQuery({
    queryKey: ['fraud-alerts', publisherId],
    queryFn: async () => {
      const { data } = await fraudApi.getAlerts(publisherId, { limit: 50 })
      return data
    },
  })

  const alerts = alertsData?.alerts || []

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-lg bg-primary-50 text-primary-600 flex items-center justify-center">
              <ShieldAlert className="h-6 w-6" aria-hidden={true} />
            </div>
            <div>
              <p className="text-sm font-medium text-primary-600">Security & Quality</p>
              <h1 className="text-3xl font-semibold text-gray-900 tracking-tight">Fraud Detection</h1>
              <p className="text-sm text-gray-600 mt-1">
                Real-time monitoring of invalid traffic, click fraud, and quality issues.
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Time window selector */}
        <div className="flex items-center gap-2">
          {(['1h', '24h', '7d', '30d'] as const).map((window) => (
            <button
              key={window}
              onClick={() => setTimeWindow(window)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                timeWindow === window
                  ? 'bg-primary-600 text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-50 border'
              }`}
            >
              {window === '1h' ? 'Last Hour' : window === '24h' ? 'Last 24 Hours' : window === '7d' ? 'Last 7 Days' : 'Last 30 Days'}
            </button>
          ))}
        </div>

        {/* Stats overview */}
        {loadingStats ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="card animate-pulse">
                <div className="h-4 bg-gray-200 rounded w-1/2 mb-3" />
                <div className="h-8 bg-gray-200 rounded w-3/4" />
              </div>
            ))}
          </div>
        ) : stats ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="card">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium text-gray-600">Total Requests</p>
                <Activity className="h-5 w-5 text-gray-400" aria-hidden={true} />
              </div>
              <p className="text-2xl font-bold text-gray-900">{formatNumber(stats.totalRequests)}</p>
            </div>

            <div className="card">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium text-gray-600">Fraud Rate</p>
                <AlertTriangle className="h-5 w-5 text-orange-400" aria-hidden={true} />
              </div>
              <p className="text-2xl font-bold text-gray-900">{formatPercentage(stats.fraudRate)}</p>
              <p className="text-xs text-gray-500 mt-1">
                {formatNumber(stats.fraudRequests)} fraudulent requests
              </p>
            </div>

            <div className="card">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium text-gray-600">Blocked</p>
                <Ban className="h-5 w-5 text-danger-400" aria-hidden={true} />
              </div>
              <p className="text-2xl font-bold text-gray-900">{formatNumber(stats.blockedRequests)}</p>
            </div>

            <div className="card">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium text-gray-600">Flagged</p>
                <Flag className="h-5 w-5 text-yellow-400" aria-hidden={true} />
              </div>
              <p className="text-2xl font-bold text-gray-900">{formatNumber(stats.flaggedRequests)}</p>
            </div>
          </div>
        ) : null}

        {/* Detection breakdown */}
        {stats && (
          <div className="card">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Detection Methods</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                  <Shield className="h-6 w-6" aria-hidden={true} />
                </div>
                <div>
                  <p className="text-sm text-gray-600">GIVT</p>
                  <p className="text-xl font-bold text-gray-900">{formatNumber(stats.givtDetections)}</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center">
                  <ShieldAlert className="h-6 w-6" aria-hidden={true} />
                </div>
                <div>
                  <p className="text-sm text-gray-600">SIVT</p>
                  <p className="text-xl font-bold text-gray-900">{formatNumber(stats.sivtDetections)}</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-lg bg-green-50 text-green-600 flex items-center justify-center">
                  <Activity className="h-6 w-6" aria-hidden={true} />
                </div>
                <div>
                  <p className="text-sm text-gray-600">ML-Based</p>
                  <p className="text-xl font-bold text-gray-900">{formatNumber(stats.mlDetections)}</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-lg bg-orange-50 text-orange-600 flex items-center justify-center">
                  <AlertTriangle className="h-6 w-6" aria-hidden={true} />
                </div>
                <div>
                  <p className="text-sm text-gray-600">Anomalies</p>
                  <p className="text-xl font-bold text-gray-900">{formatNumber(stats.anomalyDetections)}</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Recent alerts */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Recent Alerts</h2>
            {stats?.averageFraudScore !== undefined && stats?.averageFraudScore !== null && (
              <span className="text-sm text-gray-600">
                Avg Score: {stats.averageFraudScore.toFixed(2)}
              </span>
            )}
          </div>

          {loadingAlerts ? (
            <div className="space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="p-4 border rounded-lg animate-pulse">
                  <div className="h-4 bg-gray-200 rounded w-1/3 mb-2" />
                  <div className="h-3 bg-gray-200 rounded w-1/2" />
                </div>
              ))}
            </div>
          ) : alerts.length === 0 ? (
            <div className="text-center py-12">
              <Shield className="h-12 w-12 text-gray-400 mx-auto mb-3" aria-hidden={true} />
              <p className="text-sm text-gray-600">No fraud alerts in the selected time window.</p>
              <p className="text-xs text-gray-500 mt-1">Your traffic appears clean!</p>
            </div>
          ) : (
            <div className="space-y-3">
              {alerts.slice(0, 20).map((alert) => (
                <div
                  key={alert.id}
                  className={`p-4 border rounded-lg ${severityColors[alert.severity]}`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-white border">
                          {alertTypeLabels[alert.alertType]}
                        </span>
                        <span className="text-xs text-gray-600">
                          {new Date(alert.timestamp).toLocaleString()}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                        <div>
                          <p className="text-gray-600">Severity</p>
                          <p className="font-semibold capitalize">{alert.severity || 'Unknown'}</p>
                        </div>
                        <div>
                          <p className="text-gray-600">Detection</p>
                          <p className="font-semibold capitalize">
                            {alert.detectionType ? alert.detectionType.replace('_', ' ') : 'Unknown'}
                          </p>
                        </div>
                        <div>
                          <p className="text-gray-600">Action</p>
                          <p className="font-semibold capitalize">{alert.action || 'None'}</p>
                        </div>
                        <div>
                          <p className="text-gray-600">Fraud Score</p>
                          <p className="font-semibold">
                            {alert.fraudScore !== undefined && alert.fraudScore !== null 
                              ? (alert.fraudScore * 100).toFixed(1) 
                              : '0'}%
                          </p>
                        </div>
                      </div>
                      {alert.ipAddress && (
                        <p className="text-xs text-gray-600 mt-2">IP: {alert.ipAddress}</p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Top fraud types */}
        {stats?.topFraudTypes && stats.topFraudTypes.length > 0 && (
          <div className="card">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Top Fraud Patterns</h2>
            <div className="flex flex-wrap gap-2">
              {stats.topFraudTypes.map((type, idx) => (
                <span
                  key={idx}
                  className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium bg-gray-100 text-gray-700"
                >
                  {type}
                </span>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
