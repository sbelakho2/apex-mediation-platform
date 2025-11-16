'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Download, RefreshCcw } from 'lucide-react'
import { transparencyApi, type TransparencyAuction, type VerifyResult } from '../../../../lib/transparency'
import { CopyButton, VerifyBadge, Skeleton } from '../../../../components/ui'

const AUCTION_DETAIL_OVERVIEW_SKELETON_KEYS = ['auction-overview-1', 'auction-overview-2', 'auction-overview-3', 'auction-overview-4']
const CANONICAL_PARSE_LIMIT = 200_000 // ~200 KB
const CANONICAL_PREVIEW_LIMIT = 50_000

export default function TransparencyAuctionDetailPage({ params }: { params: { auction_id: string } }) {
  const { auction_id } = params
  const [auction, setAuction] = useState<TransparencyAuction | null>(null)
  const [verify, setVerify] = useState<VerifyResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [retryCount, setRetryCount] = useState(0)

  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()

    const load = async () => {
      setLoading(true)
      setError(null)
      setVerify(null)
      try {
        const auctionData = await transparencyApi.get(auction_id, { signal: controller.signal })
        if (cancelled) return
        setAuction(auctionData)

        if (auctionData.integrity?.signature) {
          try {
            const verifyData = await transparencyApi.verify(auction_id, { signal: controller.signal })
            if (!cancelled) {
              setVerify(verifyData)
            }
          } catch (verifyError: any) {
            if (!cancelled) {
              setVerify({
                status: 'unknown_key',
                reason: verifyError?.message || 'Verification details unavailable.',
              })
            }
          }
        }
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message || 'Unable to load auction details.')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void load()

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [auction_id, retryCount])

  const canonicalPayload = useMemo(() => {
    if (!verify?.canonical) return null
    const shouldFormat = verify.canonical.length <= CANONICAL_PARSE_LIMIT
    let formatted = verify.canonical
    if (shouldFormat) {
      try {
        formatted = JSON.stringify(JSON.parse(verify.canonical), null, 2)
      } catch {
        formatted = verify.canonical
      }
    }

    const truncated = formatted.length > CANONICAL_PREVIEW_LIMIT
    const preview = truncated
      ? `${formatted.slice(0, CANONICAL_PREVIEW_LIMIT)}\n… (truncated for performance)`
      : formatted

    return { preview, truncated }
  }, [verify?.canonical])

  const canonicalValue = verify?.canonical ?? ''

  const handleRetry = () => setRetryCount((count) => count + 1)

  const handleDownloadCanonical = () => {
    if (!canonicalValue) return
    const blob = new Blob([canonicalValue], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `auction-${auction_id}-canonical.json`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center gap-4 mb-2">
            <Link 
              href="/transparency/auctions"
              className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Auctions
            </Link>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-primary-600">Transparency System</p>
              <h1 className="text-3xl font-semibold text-gray-900 tracking-tight">Auction Detail</h1>
              <p className="text-sm text-gray-600 mt-1">
                Cryptographic verification and complete auction record
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {loading && <AuctionDetailSkeleton />}
        
        {!loading && error && (
          <div className="border border-red-200 rounded-lg bg-red-50 px-4 py-3 flex flex-col gap-2">
            <div>
              <p className="text-sm text-red-800 font-medium">Failed to load auction</p>
              <p className="text-xs text-red-600 mt-1">{error}</p>
            </div>
            <button
              type="button"
              onClick={handleRetry}
              className="inline-flex items-center gap-2 self-start text-sm font-medium text-red-900 border border-red-200 px-3 py-1.5 rounded hover:bg-red-100 transition-colors"
            >
              <RefreshCcw className="h-4 w-4" aria-hidden="true" />
              Retry
            </button>
          </div>
        )}

        {!loading && !error && auction && (
          <div className="space-y-6">
            {/* Auction Overview Card */}
            <div className="card">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Auction Overview</h2>
              <dl className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <dt className="text-sm font-medium text-gray-500 mb-1">Auction ID</dt>
                  <dd className="flex items-center gap-2">
                    <code className="text-sm font-mono text-gray-900">{auction.auction_id}</code>
                    <CopyButton text={auction.auction_id} variant="icon" size="sm" />
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-500 mb-1">Timestamp</dt>
                  <dd className="text-sm text-gray-900">{new Date(auction.timestamp).toLocaleString()}</dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-500 mb-1">Placement ID</dt>
                  <dd className="flex items-center gap-2">
                    <code className="text-sm font-mono text-gray-900">{auction.placement_id}</code>
                    <CopyButton text={auction.placement_id} variant="icon" size="sm" />
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-500 mb-1">Device Context</dt>
                  <dd className="text-sm text-gray-900">
                    <span className="font-semibold">{auction.device_context.os}</span>
                    <span className="text-gray-400 mx-2">/</span>
                    <span className="font-semibold">{auction.device_context.geo}</span>
                  </dd>
                </div>
              </dl>
            </div>

            {/* Integrity & Verification Card */}
            <div className="card">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Cryptographic Verification</h2>
              {auction.integrity?.signature ? (
                <div className="space-y-4">
                  <div className="flex items-start justify-between">
                    <div className="space-y-3 flex-1">
                      <div>
                        <span className="text-sm font-medium text-gray-500">Signing Key</span>
                        <div className="flex items-center gap-2 mt-1">
                          <code className="text-sm font-mono text-gray-900">{auction.integrity.key_id}</code>
                          <CopyButton text={auction.integrity.key_id || ''} variant="icon" size="sm" />
                        </div>
                      </div>
                      <div>
                        <span className="text-sm font-medium text-gray-500">Algorithm</span>
                        <p className="text-sm text-gray-900 mt-1 font-mono">{auction.integrity.algo}</p>
                      </div>
                      <div>
                        <span className="text-sm font-medium text-gray-500">Signature</span>
                        <div className="flex items-start gap-2 mt-1">
                          <code className="text-xs font-mono text-gray-900 break-all flex-1 bg-gray-50 p-2 rounded">
                            {auction.integrity.signature}
                          </code>
                          <CopyButton text={auction.integrity.signature} variant="icon" size="sm" />
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="pt-4 border-t">
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium text-gray-500">Verification Status:</span>
                      <VerifyBadge 
                        auctionId={auction.auction_id}
                        hasSigned={true}
                        autoLoad={true}
                      />
                    </div>
                    {canonicalPayload && (
                      <details className="mt-4">
                        <summary className="cursor-pointer text-sm font-medium text-gray-700 hover:text-gray-900">
                          View Canonical Payload
                        </summary>
                        {canonicalValue && (
                        <div className="mt-3">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs text-gray-500">Canonical JSON used for signature</span>
                            <div className="flex items-center gap-2">
                              <CopyButton text={canonicalValue} variant="inline" size="sm" label="Copy Payload" />
                              <button
                                type="button"
                                onClick={handleDownloadCanonical}
                                className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-600 hover:text-gray-900"
                              >
                                <Download className="h-3.5 w-3.5" aria-hidden="true" />
                                Download JSON
                              </button>
                            </div>
                          </div>
                          <pre className="text-xs bg-gray-900 text-gray-100 p-4 rounded-lg overflow-auto max-h-96">
                            {canonicalPayload.preview}
                          </pre>
                          {canonicalPayload.truncated && (
                            <p className="text-[11px] text-gray-500 mt-2">
                              Preview truncated to protect browser performance. Download or copy the payload for the full JSON body.
                            </p>
                          )}
                        </div>
                        )}
                      </details>
                    )}
                    {verify?.reason && (
                      <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                        <p className="text-sm text-amber-800">
                          <span className="font-medium">Note: </span>{verify.reason}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="text-center py-8">
                  <p className="text-gray-500">This auction was not signed</p>
                  <p className="text-xs text-gray-400 mt-1">
                    Not sampled for transparency or signature missing
                  </p>
                </div>
              )}
            </div>

            {/* Auction Candidates Card */}
            <div className="card">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Bid Candidates</h2>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-left px-4 py-3 text-gray-600 font-medium">Source</th>
                      <th className="text-left px-4 py-3 text-gray-600 font-medium">eCPM</th>
                      <th className="text-left px-4 py-3 text-gray-600 font-medium">Status</th>
                      <th className="text-left px-4 py-3 text-gray-600 font-medium">Response Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auction.candidates.map((c) => (
                      <tr key={c.metadata_hash} className="border-t border-gray-100">
                        <td className="px-4 py-3 text-gray-900 font-medium">{c.source}</td>
                        <td className="px-4 py-3 text-gray-900">
                          {c.bid_ecpm.toFixed(4)} <span className="text-gray-500">{c.currency}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex px-2 py-1 text-xs font-medium rounded ${
                            c.status === 'bid' ? 'bg-green-100 text-green-700' :
                            c.status === 'no_bid' ? 'bg-gray-100 text-gray-600' :
                            'bg-red-100 text-red-700'
                          }`}>
                            {c.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-600">{c.response_time_ms}ms</td>
                      </tr>
                    ))}
                    {auction.candidates.length === 0 && (
                      <tr>
                        <td className="px-4 py-8 text-center text-gray-500" colSpan={4}>
                          No candidates recorded for this auction
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

function AuctionDetailSkeleton() {
  return (
    <div className="space-y-6">
      {/* Overview skeleton */}
      <div className="card">
        <Skeleton width="w-48" height="h-6" className="mb-4" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {AUCTION_DETAIL_OVERVIEW_SKELETON_KEYS.map((key) => (
            <div key={key}>
              <Skeleton width="w-24" height="h-4" className="mb-2" />
              <Skeleton width="w-full" height="h-5" />
            </div>
          ))}
        </div>
      </div>
      
      {/* Integrity skeleton */}
      <div className="card">
        <Skeleton width="w-56" height="h-6" className="mb-4" />
        <div className="space-y-4">
          <Skeleton width="w-full" height="h-20" />
          <Skeleton width="w-full" height="h-16" />
        </div>
      </div>
      
      {/* Candidates skeleton */}
      <div className="card">
        <Skeleton width="w-32" height="h-6" className="mb-4" />
        <Skeleton width="w-full" height="h-48" />
      </div>
    </div>
  )
}
