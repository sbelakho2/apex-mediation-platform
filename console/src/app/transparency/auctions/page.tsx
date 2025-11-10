'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { transparencyApi, type TransparencyAuction } from '../../../lib/transparency'
import { useDebouncedValue, useQueryParams } from '../../../lib/hooks'
import { VerifyBadge, Skeleton, CopyButton } from '../../../components/ui'

function formatCurrency(value: number, cur: string) {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: cur || 'USD', maximumFractionDigits: 4 }).format(value)
  } catch {
    return `${value.toFixed(4)} ${cur || 'USD'}`
  }
}

export default function TransparencyAuctionsPage() {
  const { params: urlParams, updateParams } = useQueryParams()
  
  // Initialize state from URL or defaults
  const [data, setData] = useState<TransparencyAuction[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [page, setPage] = useState(parseInt(urlParams?.get('page') || '1'))
  const [limit] = useState(25)
  const [from, setFrom] = useState<string>(urlParams?.get('from') || '')
  const [to, setTo] = useState<string>(urlParams?.get('to') || '')
  const [placementId, setPlacementId] = useState(urlParams?.get('placement_id') || '')
  const [surface, setSurface] = useState(urlParams?.get('surface') || '')
  const [geo, setGeo] = useState(urlParams?.get('geo') || '')

  // Debounce filter values to reduce API calls
  const debouncedFrom = useDebouncedValue(from, 300)
  const debouncedTo = useDebouncedValue(to, 300)
  const debouncedPlacementId = useDebouncedValue(placementId, 300)
  const debouncedSurface = useDebouncedValue(surface, 300)
  const debouncedGeo = useDebouncedValue(geo, 300)

  const params = useMemo(() => ({ 
    page, 
    limit, 
    from: debouncedFrom || undefined, 
    to: debouncedTo || undefined, 
    placement_id: debouncedPlacementId || undefined, 
    surface: debouncedSurface || undefined, 
    geo: debouncedGeo || undefined 
  }), [page, limit, debouncedFrom, debouncedTo, debouncedPlacementId, debouncedSurface, debouncedGeo])

  // Sync state changes to URL
  useEffect(() => {
    updateParams({
      page: page > 1 ? page : null,
      from: debouncedFrom || null,
      to: debouncedTo || null,
      placement_id: debouncedPlacementId || null,
      surface: debouncedSurface || null,
      geo: debouncedGeo || null,
    })
  }, [page, debouncedFrom, debouncedTo, debouncedPlacementId, debouncedSurface, debouncedGeo, updateParams])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    transparencyApi
      .list(params)
      .then((resp) => {
        if (!cancelled) setData(resp.data)
      })
      .catch((e: any) => !cancelled && setError(e?.message || 'Failed to load auctions'))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [params])

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold text-gray-900">Transparency — Auctions</h1>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-3 mb-4">
        <input className="border rounded px-3 py-2" placeholder="From (ISO)" value={from} onChange={(e) => setFrom(e.target.value)} />
        <input className="border rounded px-3 py-2" placeholder="To (ISO)" value={to} onChange={(e) => setTo(e.target.value)} />
        <input className="border rounded px-3 py-2" placeholder="Placement ID" value={placementId} onChange={(e) => setPlacementId(e.target.value)} />
        <select className="border rounded px-3 py-2" value={surface} onChange={(e) => setSurface(e.target.value)}>
          <option value="">Surface</option>
          <option value="mobile_app">Mobile App</option>
          <option value="web">Web</option>
          <option value="ctv">CTV</option>
        </select>
        <input className="border rounded px-3 py-2" placeholder="Geo (CC)" value={geo} onChange={(e) => setGeo(e.target.value.toUpperCase())} />
      </div>

      {loading && <AuctionsTableSkeleton />}
      
      {!loading && error && (
        <div className="border border-red-200 rounded-lg bg-red-50 px-4 py-3">
          <p className="text-sm text-red-800 font-medium">Failed to load auctions</p>
          <p className="text-xs text-red-600 mt-1">{error}</p>
        </div>
      )}

      {!loading && !error && (
        <div className="overflow-x-auto border rounded">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="text-left px-3 py-2">Timestamp</th>
                <th className="text-left px-3 py-2">Auction ID</th>
                <th className="text-left px-3 py-2">Placement</th>
                <th className="text-left px-3 py-2">Device</th>
                <th className="text-left px-3 py-2">Winner</th>
                <th className="text-left px-3 py-2">Verification</th>
              </tr>
            </thead>
            <tbody>
              {data.map((row) => (
                <tr className="border-t hover:bg-gray-50" key={row.auction_id}>
                  <td className="px-3 py-2 whitespace-nowrap text-gray-700">
                    {new Date(row.timestamp).toLocaleString()}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <Link 
                        href={`/transparency/auctions/${row.auction_id}`}
                        className="text-primary-700 hover:underline font-mono text-xs"
                      >
                        {row.auction_id.slice(0, 8)}...
                      </Link>
                      <CopyButton text={row.auction_id} variant="icon" size="sm" />
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-gray-700">{row.placement_id.slice(0, 12)}...</span>
                      <CopyButton text={row.placement_id} variant="icon" size="sm" />
                    </div>
                  </td>
                  <td className="px-3 py-2 text-gray-700">
                    <span className="font-medium">{row.device_context.os}</span>
                    <span className="text-gray-400 mx-1">/</span>
                    <span className="font-semibold">{row.device_context.geo}</span>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-col gap-0.5">
                      <span className="font-semibold text-gray-900">
                        {formatCurrency(row.winner.bid_ecpm, row.winner.currency)}
                      </span>
                      <span className="text-xs text-gray-500">{row.winner.source}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <VerifyBadge 
                      auctionId={row.auction_id} 
                      hasSigned={!!row.integrity?.signature}
                      compact={true}
                      autoLoad={false}
                    />
                  </td>
                </tr>
              ))}
              {data.length === 0 && (
                <tr>
                  <td className="px-3 py-8 text-center text-gray-500" colSpan={6}>
                    <div className="flex flex-col items-center gap-2">
                      <p className="font-medium">No auctions found</p>
                      <p className="text-xs">Try adjusting your filters or date range</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {!loading && !error && data.length > 0 && (
        <div className="flex items-center justify-between mt-4">
          <button 
            className="px-4 py-2 border rounded font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 transition-colors" 
            onClick={() => setPage((p) => Math.max(1, p - 1))} 
            disabled={page <= 1}
          >
            Previous
          </button>
          <span className="text-sm text-gray-600 font-medium">Page {page}</span>
          <button 
            className="px-4 py-2 border rounded font-medium hover:bg-gray-50 transition-colors" 
            onClick={() => setPage((p) => p + 1)}
            disabled={data.length < limit}
          >
            Next
          </button>
        </div>
      )}
    </div>
  )
}

function AuctionsTableSkeleton() {
  return (
    <div className="overflow-x-auto border rounded">
      <table className="min-w-full text-sm">
        <thead className="bg-gray-50 text-gray-600">
          <tr>
            <th className="text-left px-3 py-2">Timestamp</th>
            <th className="text-left px-3 py-2">Auction ID</th>
            <th className="text-left px-3 py-2">Placement</th>
            <th className="text-left px-3 py-2">Device</th>
            <th className="text-left px-3 py-2">Winner</th>
            <th className="text-left px-3 py-2">Verification</th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: 5 }).map((_, i) => (
            <tr key={i} className="border-t">
              <td className="px-3 py-2">
                <Skeleton width="w-32" height="h-4" />
              </td>
              <td className="px-3 py-2">
                <Skeleton width="w-20" height="h-4" />
              </td>
              <td className="px-3 py-2">
                <Skeleton width="w-24" height="h-4" />
              </td>
              <td className="px-3 py-2">
                <Skeleton width="w-16" height="h-4" />
              </td>
              <td className="px-3 py-2">
                <Skeleton width="w-20" height="h-4" />
              </td>
              <td className="px-3 py-2">
                <Skeleton width="w-16" height="h-6" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
