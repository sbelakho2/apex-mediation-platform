'use client'

import { useEffect, useState } from 'react'
import { listBillingAudit, type AuditEntry } from '@/lib/admin'
import Pagination from '@/components/ui/Pagination'

export default function AdminAuditPage() {
  const [data, setData] = useState<AuditEntry[]>([])
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      try {
        const res = await listBillingAudit({ page, limit: 20 })
        if (!cancelled) {
          setData(res.data)
          setTotalPages(res.pagination.total_pages)
          setError(null)
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'Failed to load audit log')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [page])

  return (
    <div className="bg-white border rounded-lg">
      <div className="p-6">
        <h2 className="text-xl font-semibold text-gray-900">Billing Audit Log</h2>
        <p className="text-gray-600 mt-2">Recent audit entries from the billing_audit table.</p>
      </div>
      <div className="border-t">
        {loading ? (
          <div className="p-6 text-gray-600">Loading…</div>
        ) : error ? (
          <div className="p-6 text-red-600" role="alert">{error}</div>
        ) : data.length === 0 ? (
          <div className="p-6 text-gray-600">No audit entries found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full border-t">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left text-xs font-semibold text-gray-600 px-4 py-2">Time</th>
                  <th className="text-left text-xs font-semibold text-gray-600 px-4 py-2">Org</th>
                  <th className="text-left text-xs font-semibold text-gray-600 px-4 py-2">Action</th>
                  <th className="text-left text-xs font-semibold text-gray-600 px-4 py-2">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.map((row) => (
                  <tr key={row.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2 text-sm text-gray-900">{new Date(row.created_at).toLocaleString()}</td>
                    <td className="px-4 py-2 text-sm text-gray-700">{row.organization_id}</td>
                    <td className="px-4 py-2 text-sm font-medium text-gray-900">{row.event_type}</td>
                    <td className="px-4 py-2 text-sm text-gray-700 truncate max-w-[480px]">
                      <code className="text-xs">{safeSummary(row.metadata)}</code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <div className="p-4 border-t flex items-center justify-end">
        <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
      </div>
    </div>
  )
}

function safeSummary(meta: any): string {
  try {
    if (!meta) return ''
    const str = typeof meta === 'string' ? meta : JSON.stringify(meta)
    // Truncate to avoid huge cells
    return str.length > 180 ? str.slice(0, 177) + '…' : str
  } catch {
    return ''
  }
}
