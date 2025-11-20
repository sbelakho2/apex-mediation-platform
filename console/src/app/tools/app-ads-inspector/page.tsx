"use client"

import { useCallback, useMemo, useState } from 'react'
import { toolsApi } from '@/lib/api'
import type { AppAdsInspectorResult, AppAdsInspectorVendorResult } from '@/types'

function StatusPill({ pass }: { pass: boolean }) {
  const color = pass ? 'bg-green-100 text-green-800 border-green-200' : 'bg-amber-100 text-amber-800 border-amber-200'
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${color}`}>
      {pass ? 'PASS' : 'ATTENTION'}
    </span>
  )
}

function SuggestedLines({ vendor }: { vendor: AppAdsInspectorVendorResult }) {
  const handleCopy = useCallback(async (line: string) => {
    try {
      await navigator.clipboard.writeText(line)
    } catch (e) {
      // no-op; clipboard not available
      console.warn('[tools] clipboard not available', e)
    }
  }, [])

  if (vendor.pass) return null
  return (
    <div className="space-y-1">
      {vendor.suggested.map((line, idx) => (
        <div key={idx} className="flex items-center gap-2">
          <code className="text-xs bg-gray-50 border border-gray-200 rounded px-2 py-1 overflow-x-auto whitespace-pre">{line}</code>
          <button
            type="button"
            className="text-xs px-2 py-1 rounded border border-gray-300 hover:bg-gray-50"
            onClick={() => handleCopy(line)}
            aria-label={`Copy suggested line for ${vendor.vendor}`}
          >Copy</button>
        </div>
      ))}
    </div>
  )
}

export default function AppAdsInspectorPage() {
  const [domain, setDomain] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<AppAdsInspectorResult | null>(null)
  const [showRaw, setShowRaw] = useState(false)

  const onRun = useCallback(async () => {
    setError(null)
    setLoading(true)
    setResult(null)
    try {
      const res = await toolsApi.inspectAppAds(domain)
      setResult(res)
    } catch (e: any) {
      setError(e?.message || 'Failed to run inspector')
    } finally {
      setLoading(false)
    }
  }, [domain])

  const anyAttention = useMemo(
    () => (result?.vendors || []).some(v => !v.pass),
    [result]
  )

  return (
    <div className="p-6 flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Developer Tools — app-ads.txt Inspector</h1>
        <p className="text-sm text-gray-600 mt-1">
          Check whether your enabled vendors have the required entries in your app-ads.txt. Use the suggested lines to copy and paste into your file.
        </p>
      </div>

      <div className="flex items-end gap-3">
        <div className="flex-1">
          <label htmlFor="domain" className="block text-sm font-medium text-gray-700">Domain</label>
          <input
            id="domain"
            type="text"
            placeholder="example.com"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            className="mt-1 w-full rounded border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <button
          type="button"
          onClick={onRun}
          disabled={!domain.trim() || loading}
          className="h-10 px-4 rounded bg-indigo-600 text-white disabled:opacity-60"
        >{loading ? 'Checking…' : (result ? 'Refresh' : 'Run')}</button>
      </div>

      {error && (
        <div className="rounded border border-red-200 bg-red-50 text-red-800 px-3 py-2 text-sm">{error}</div>
      )}

      {result && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-700">
              <span className="font-medium">Domain:</span> {result.domain}
              {typeof result.httpStatus === 'number' && (
                <span className="ml-3 text-gray-500">HTTP {result.httpStatus}</span>
              )}
            </div>
            <div>
              <StatusPill pass={result.fetched && !anyAttention} />
            </div>
          </div>

          {!result.fetched && (
            <div className="rounded border border-amber-200 bg-amber-50 text-amber-900 px-3 py-2 text-sm">
              Could not fetch <code className="px-1">app-ads.txt</code> from this domain. Verify DNS/HTTPS and try again.
            </div>
          )}

          {result.vendors?.length > 0 && (
            <div className="overflow-x-auto">
              <table className="min-w-full border border-gray-200 rounded">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left text-sm font-medium text-gray-700 p-2 border-b">Vendor</th>
                    <th className="text-left text-sm font-medium text-gray-700 p-2 border-b">Status</th>
                    <th className="text-left text-sm font-medium text-gray-700 p-2 border-b">Missing</th>
                    <th className="text-left text-sm font-medium text-gray-700 p-2 border-b">Suggested</th>
                  </tr>
                </thead>
                <tbody>
                  {result.vendors.map(v => (
                    <tr key={v.vendor} className="align-top">
                      <td className="p-2 border-b text-sm font-medium">{v.vendor}</td>
                      <td className="p-2 border-b"><StatusPill pass={v.pass} /></td>
                      <td className="p-2 border-b text-xs text-gray-700">
                        {v.pass ? <span className="text-gray-500">—</span> : (
                          <ul className="list-disc list-inside space-y-1">
                            {v.missing.map((m, idx) => <li key={idx}><code>{m}</code></li>)}
                          </ul>
                        )}
                      </td>
                      <td className="p-2 border-b"><SuggestedLines vendor={v} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {result.rawSample && (
            <div className="mt-2">
              <button
                type="button"
                className="text-sm text-indigo-700 hover:underline"
                onClick={() => setShowRaw(s => !s)}
              >{showRaw ? 'Hide' : 'Show'} raw sample</button>
              {showRaw && (
                <pre className="mt-2 max-h-56 overflow-auto text-xs bg-gray-50 border border-gray-200 rounded p-2 whitespace-pre-wrap">{result.rawSample}</pre>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
