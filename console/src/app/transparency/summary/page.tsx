'use client'

import { useEffect, useState } from 'react'
import { apiClient } from '../../../lib/api-client'

type Summary = {
  total_sampled: number
  winners_by_source: Array<{ source: string; count: number }>
  avg_fee_bp: number
  publisher_share_avg: number
}

export default function TransparencySummaryPage() {
  const [data, setData] = useState<Summary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    apiClient
      .get('/transparency/summary/auctions')
      .then((res) => { if (!cancelled) setData(res.data as Summary) })
      .catch((e: any) => !cancelled && setError(e?.message || 'Failed to load summary'))
      .finally(() => !cancelled && setLoading(false))
    return () => { cancelled = true }
  }, [])

  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold text-gray-900 mb-4">Transparency — Summary</h1>
      {loading && <div className="text-gray-600">Loading…</div>}
      {error && <div className="text-red-600">{error}</div>}
      {!loading && !error && data && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="border rounded p-4">
            <div className="text-sm text-gray-700"><span className="font-semibold">Total sampled auctions:</span> {data.total_sampled}</div>
            <div className="text-sm text-gray-700"><span className="font-semibold">Avg. fee (bp):</span> {data.avg_fee_bp}</div>
            <div className="text-sm text-gray-700"><span className="font-semibold">Avg. publisher share:</span> {Math.round((data.publisher_share_avg || 0) * 10000) / 10000}</div>
          </div>
          <div className="border rounded p-4">
            <h2 className="font-semibold mb-2">Winners by source</h2>
            <ul className="text-sm text-gray-700 list-disc pl-5">
              {data.winners_by_source?.map((w) => (
                <li key={w.source}>{w.source}: {w.count}</li>
              ))}
              {(!data.winners_by_source || data.winners_by_source.length === 0) && (
                <li className="text-gray-500">No data</li>
              )}
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}
