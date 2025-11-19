'use client'

import { useEffect, useMemo, useState } from 'react'
import { listBillingAudit, type AuditEntry } from '@/lib/admin'
import Pagination from '@/components/ui/Pagination'
import { Section, Container } from '@/components/ui'

function escapeCsvField(value: unknown): string {
  const s = String(value ?? '')
  // Escape quotes and wrap in quotes if contains delimiter/newline
  const escaped = s.replace(/"/g, '""')
  if (/[",\n]/.test(escaped)) {
    return `"${escaped}"`
  }
  return escaped
}

function sanitizeMetadata(meta: unknown): string {
  try {
    if (!meta) return ''
    return JSON.stringify(meta)
  } catch {
    return ''
  }
}

export default function AdminAuditPage() {
  const [data, setData] = useState<AuditEntry[]>([])
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [downloading, setDownloading] = useState(false)

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
    <Section>
      <Container>
      <div className="bg-white border rounded-lg">
        <div className="p-6">
          <h2 className="text-xl font-semibold text-gray-900">Billing Audit Log</h2>
          <p className="text-gray-600 mt-2">Recent audit entries from the billing_audit table.</p>
          <div className="mt-4">
            <button
              className="btn btn-outline text-sm"
            onClick={async () => {
              setDownloading(true)
              try {
                const header = ['id', 'organization_id', 'event_type', 'created_at', 'metadata']
                const rows = data.map((row) => [
                  escapeCsvField(row.id),
                  escapeCsvField(row.organization_id),
                  escapeCsvField(row.event_type),
                  escapeCsvField(row.created_at),
                  escapeCsvField(sanitizeMetadata(row.metadata)),
                ])
                const csv = [header.join(','), ...rows.map((r) => r.join(','))].join('\n')
                const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url
                a.download = `billing_audit_page-${page}.csv`
                document.body.appendChild(a)
                a.click()
                a.remove()
                URL.revokeObjectURL(url)
              } finally {
                setDownloading(false)
              }
            }}
            disabled={loading || downloading || data.length === 0}
            aria-disabled={loading || downloading || data.length === 0}
          >
            {downloading ? 'Exporting…' : 'Download CSV'}
          </button>
          </div>
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
                    <th scope="col" className="text-left text-xs font-semibold text-gray-600 px-4 py-2">Time</th>
                    <th scope="col" className="text-left text-xs font-semibold text-gray-600 px-4 py-2">Org</th>
                    <th scope="col" className="text-left text-xs font-semibold text-gray-600 px-4 py-2">Action</th>
                    <th scope="col" className="text-left text-xs font-semibold text-gray-600 px-4 py-2">Details</th>
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
      </Container>
    </Section>
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
