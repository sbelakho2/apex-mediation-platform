"use client"

import { useCallback, useMemo, useState } from 'react'
import { toolsApi } from '@/lib/api'
import type { SupplyChainStatusResult } from '@/types'

function StatusPill({ authorized }: { authorized: boolean }) {
  const color = authorized ? 'bg-green-100 text-green-800 border-green-200' : 'bg-amber-100 text-amber-800 border-amber-200'
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${color}`}>
      {authorized ? 'AUTHORIZED' : 'ATTENTION'}
    </span>
  )
}

function InfoRow({ label, value }: { label: string; value?: string }) {
  if (!value) return null
  return (
    <div className="flex items-center gap-2 text-sm text-gray-700">
      <span className="font-medium text-gray-800">{label}:</span>
      <span>{value}</span>
    </div>
  )
}

export default function SupplyChainStatusPage() {
  const [domain, setDomain] = useState('')
  const [sellerId, setSellerId] = useState('')
  const [appStoreId, setAppStoreId] = useState('')
  const [siteId, setSiteId] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<SupplyChainStatusResult | null>(null)

  const onRun = useCallback(async () => {
    setError(null)
    setLoading(true)
    setResult(null)
    try {
      const status = await toolsApi.getSupplyChainStatus({
        domain,
        sellerId: sellerId || undefined,
        appStoreId: appStoreId || undefined,
        siteId: siteId || undefined,
      })
      setResult(status)
    } catch (e: any) {
      setError(e?.message || 'Failed to fetch supply chain status')
    } finally {
      setLoading(false)
    }
  }, [appStoreId, domain, sellerId, siteId])

  const declaredEntries = useMemo(() => result?.entries ?? [], [result?.entries])

  return (
    <div className="p-6 flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Developer Tools — Supply Chain Status</h1>
        <p className="text-sm text-gray-600 mt-1">
          Check whether a seller is declared in your ingested app-ads.txt corpus and view the sellers.json directory entry for quick debugging.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="space-y-2">
          <label htmlFor="domain" className="block text-sm font-medium text-gray-700">Domain</label>
          <input
            id="domain"
            type="text"
            placeholder="example.com"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            className="w-full rounded border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <div className="space-y-2">
          <label htmlFor="sellerId" className="block text-sm font-medium text-gray-700">Seller ID (optional)</label>
          <input
            id="sellerId"
            type="text"
            placeholder="pub-12345"
            value={sellerId}
            onChange={(e) => setSellerId(e.target.value)}
            className="w-full rounded border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <div className="space-y-2">
          <label htmlFor="appStoreId" className="block text-sm font-medium text-gray-700">App Store ID (optional)</label>
          <input
            id="appStoreId"
            type="text"
            placeholder="com.example.app"
            value={appStoreId}
            onChange={(e) => setAppStoreId(e.target.value)}
            className="w-full rounded border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <div className="space-y-2">
          <label htmlFor="siteId" className="block text-sm font-medium text-gray-700">Site ID (optional)</label>
          <input
            id="siteId"
            type="text"
            placeholder="web_site_id"
            value={siteId}
            onChange={(e) => setSiteId(e.target.value)}
            className="w-full rounded border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <div className="lg:col-span-2 flex justify-end">
          <button
            type="button"
            onClick={onRun}
            disabled={!domain.trim() || loading}
            className="h-10 px-4 rounded bg-indigo-600 text-white disabled:opacity-60"
          >{loading ? 'Checking…' : (result ? 'Refresh' : 'Run')}</button>
        </div>
      </div>

      {error && (
        <div className="rounded border border-red-200 bg-red-50 text-red-800 px-3 py-2 text-sm">{error}</div>
      )}

      {result && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex flex-col gap-1 text-sm text-gray-700">
              <div className="flex items-center gap-3">
                <span className="font-medium text-gray-900">Domain: {result.domain}</span>
                <StatusPill authorized={result.authorized} />
              </div>
              <div className="flex flex-wrap gap-3">
                <InfoRow label="Seller ID" value={result.sellerId} />
                <InfoRow label="App Store ID" value={result.appStoreId} />
                <InfoRow label="Site ID" value={result.siteId} />
              </div>
            </div>
            {result.reason && !result.authorized && (
              <div className="rounded border border-amber-200 bg-amber-50 text-amber-900 px-3 py-2 text-sm max-w-md">{result.reason}</div>
            )}
          </div>

          {result.sellerInfo && (
            <div className="rounded border border-gray-200 bg-white p-3">
              <div className="text-sm font-medium text-gray-800 mb-2">Seller directory</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-y-1 text-sm text-gray-700">
                <InfoRow label="Seller ID" value={result.sellerInfo.sellerId} />
                <InfoRow label="Domain" value={result.sellerInfo.domain} />
                <InfoRow label="Name" value={result.sellerInfo.name} />
                <InfoRow label="Status" value={result.sellerInfo.status} />
              </div>
            </div>
          )}

          <div className="rounded border border-gray-200 bg-white">
            <div className="flex items-center justify-between px-3 py-2 border-b bg-gray-50">
              <div className="text-sm font-medium text-gray-800">Declared app-ads.txt entries</div>
              <div className="text-xs text-gray-500">{declaredEntries.length} entry{declaredEntries.length === 1 ? '' : 'ies'}</div>
            </div>
            {declaredEntries.length === 0 ? (
              <div className="p-3 text-sm text-gray-600">No entries found for this domain in the ingested corpus.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-left font-medium text-gray-700 p-2 border-b">Seller ID</th>
                      <th className="text-left font-medium text-gray-700 p-2 border-b">Relationship</th>
                      <th className="text-left font-medium text-gray-700 p-2 border-b">App Store ID</th>
                      <th className="text-left font-medium text-gray-700 p-2 border-b">Site ID</th>
                    </tr>
                  </thead>
                  <tbody>
                    {declaredEntries.map((entry) => {
                      const rowKey = `${entry.sellerId}-${entry.appStoreId || entry.siteId || 'na'}`
                      return (
                        <tr key={rowKey} className="border-b last:border-b-0">
                          <td className="p-2 font-medium text-gray-900">{entry.sellerId}</td>
                          <td className="p-2 text-gray-700">{entry.relationship || '—'}</td>
                          <td className="p-2 text-gray-700">{entry.appStoreId || '—'}</td>
                          <td className="p-2 text-gray-700">{entry.siteId || '—'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
