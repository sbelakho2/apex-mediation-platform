'use client'

import { useEffect, useMemo, useState } from 'react'
import { transparencyApi, type TransparencyAuction } from '../../../lib/transparency'

function formatCurrency(value: number, cur: string) {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: cur || 'USD', maximumFractionDigits: 4 }).format(value)
  } catch {
    return `${value.toFixed(4)} ${cur || 'USD'}`
  }
}

export default function TransparencyAuctionsPage() {
  const [data, setData] = useState<TransparencyAuction[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [page, setPage] = useState(1)
  const [limit] = useState(25)
  const [from, setFrom] = useState<string>('')
  const [to, setTo] = useState<string>('')
  const [placementId, setPlacementId] = useState('')
  const [surface, setSurface] = useState('')
  const [geo, setGeo] = useState('')

  const params = useMemo(() => ({ page, limit, from: from || undefined, to: to || undefined, placement_id: placementId || undefined, surface: surface || undefined, geo: geo || undefined }), [page, limit, from, to, placementId, surface, geo])

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

      {loading && <div className="text-gray-600">Loading…</div>}
      {error && <div className="text-red-600">{error}</div>}

      {!loading && !error && (
        <div className="overflow-x-auto border rounded">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="text-left px-3 py-2">Timestamp</th>
                <th className="text-left px-3 py-2">Auction</th>
                <th className="text-left px-3 py-2">Placement</th>
                <th className="text-left px-3 py-2">Device</th>
                <th className="text-left px-3 py-2">Winner</th>
                <th className="text-left px-3 py-2">Integrity</th>
              </tr>
            </thead>
            <tbody>
              {data.map((row) => (
                <tr className="border-t" key={row.auction_id}>
                  <td className="px-3 py-2 whitespace-nowrap">{new Date(row.timestamp).toLocaleString()}</td>
                  <td className="px-3 py-2">
                    <a className="text-primary-700 hover:underline" href={`/transparency/auctions/${row.auction_id}`}>{row.auction_id}</a>
                  </td>
                  <td className="px-3 py-2">{row.placement_id}</td>
                  <td className="px-3 py-2">{row.device_context.os}/{row.device_context.geo}</td>
                  <td className="px-3 py-2">{formatCurrency(row.winner.bid_ecpm, row.winner.currency)} — {row.winner.source}</td>
                  <td className="px-3 py-2">
                    {row.integrity?.signature ? (
                      <span className="inline-flex items-center gap-1 text-green-700">Signed<span className="text-xs text-gray-500">({row.integrity.key_id})</span></span>
                    ) : (
                      <span className="text-gray-500">Not signed</span>
                    )}
                  </td>
                </tr>
              ))}
              {data.length === 0 && (
                <tr>
                  <td className="px-3 py-6 text-center text-gray-500" colSpan={6}>No auctions found for filters.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Simple pagination */}
      <div className="flex items-center gap-2 mt-4">
        <button className="px-3 py-2 border rounded disabled:opacity-50" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
          Previous
        </button>
        <span className="text-sm text-gray-600">Page {page}</span>
        <button className="px-3 py-2 border rounded" onClick={() => setPage((p) => p + 1)}>Next</button>
      </div>
    </div>
  )
}
