'use client'

import { useEffect, useState } from 'react'
import { transparencyApi, type TransparencyAuction, type VerifyResult } from '../../../../lib/transparency'

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      className="px-2 py-1 text-xs border rounded hover:bg-gray-50"
      onClick={async () => {
        await navigator.clipboard.writeText(text)
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      }}
    >
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
}

export default function TransparencyAuctionDetailPage({ params }: { params: { auction_id: string } }) {
  const { auction_id } = params
  const [auction, setAuction] = useState<TransparencyAuction | null>(null)
  const [verify, setVerify] = useState<VerifyResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    Promise.all([transparencyApi.get(auction_id), transparencyApi.verify(auction_id)])
      .then(([a, v]) => {
        if (!cancelled) {
          setAuction(a)
          setVerify(v)
        }
      })
      .catch((e: any) => !cancelled && setError(e?.message || 'Failed to load'))
      .finally(() => !cancelled && setLoading(false))
    return () => { cancelled = true }
  }, [auction_id])

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold text-gray-900">Transparency — Auction Detail</h1>
      </div>
      {loading && <div className="text-gray-600">Loading…</div>}
      {error && <div className="text-red-600">{error}</div>}
      {!loading && !error && auction && (
        <div className="space-y-6">
          <div className="border rounded p-4">
            <div className="text-sm text-gray-700"><span className="font-semibold">Auction:</span> {auction.auction_id}</div>
            <div className="text-sm text-gray-700"><span className="font-semibold">Timestamp:</span> {new Date(auction.timestamp).toLocaleString()}</div>
            <div className="text-sm text-gray-700"><span className="font-semibold">Placement:</span> {auction.placement_id}</div>
            <div className="text-sm text-gray-700"><span className="font-semibold">Device:</span> {auction.device_context.os}/{auction.device_context.geo}</div>
          </div>

          <div className="border rounded p-4">
            <h2 className="font-semibold mb-2">Integrity</h2>
            {auction.integrity?.signature ? (
              <div className="space-y-2">
                <div className="text-sm text-gray-700"><span className="font-semibold">Key ID:</span> {auction.integrity.key_id}</div>
                <div className="text-sm text-gray-700"><span className="font-semibold">Algo:</span> {auction.integrity.algo}</div>
                <div className="text-sm text-gray-700 break-all">
                  <span className="font-semibold">Signature:</span> {auction.integrity.signature}
                  <span className="ml-2"><CopyButton text={auction.integrity.signature} /></span>
                </div>
                <div className="mt-3">
                  <span
                    className={`inline-flex items-center px-2 py-1 rounded text-xs ${verify?.status === 'pass' ? 'bg-green-100 text-green-800' : verify?.status === 'fail' ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-700'}`}
                  >
                    Verify: {verify?.status?.toUpperCase() || 'UNKNOWN'}
                  </span>
                </div>
                {verify?.canonical && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-sm text-gray-700">Canonical payload</summary>
                    <pre className="mt-2 text-xs bg-gray-50 p-2 rounded overflow-auto">{verify.canonical}</pre>
                    <div className="mt-1"><CopyButton text={verify.canonical} /></div>
                  </details>
                )}
                {verify?.reason && (
                  <div className="text-xs text-gray-600">Reason: {verify.reason}</div>
                )}
              </div>
            ) : (
              <div className="text-sm text-gray-500">Not signed</div>
            )}
          </div>

          <div className="border rounded p-4">
            <h2 className="font-semibold mb-2">Candidates</h2>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-gray-600">
                  <tr>
                    <th className="text-left px-3 py-2">Source</th>
                    <th className="text-left px-3 py-2">eCPM</th>
                    <th className="text-left px-3 py-2">Status</th>
                    <th className="text-left px-3 py-2">Response (ms)</th>
                  </tr>
                </thead>
                <tbody>
                  {auction.candidates.map((c) => (
                    <tr key={c.metadata_hash} className="border-t">
                      <td className="px-3 py-2">{c.source}</td>
                      <td className="px-3 py-2">{c.bid_ecpm.toFixed(4)} {c.currency}</td>
                      <td className="px-3 py-2">{c.status}</td>
                      <td className="px-3 py-2">{c.response_time_ms}</td>
                    </tr>
                  ))}
                  {auction.candidates.length === 0 && (
                    <tr>
                      <td className="px-3 py-6 text-center text-gray-500" colSpan={4}>No candidates recorded</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
