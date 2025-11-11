'use client'

import { useEffect, useState } from 'react'
import { apiClient } from '@/lib/api-client'

type MetaInfo = { name: string; version: string; environment: string }

export default function AdminHealthPage() {
  const [info, setInfo] = useState<MetaInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      try {
        const res = await apiClient.get('/meta/info')
        if (!cancelled) setInfo(res?.data?.data || null)
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'Failed to load meta info')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="space-y-6">
      <section className="bg-white border rounded-lg p-6">
        <h2 className="text-xl font-semibold text-gray-900">Service Info</h2>
        {loading ? (
          <p className="text-gray-600 mt-2">Loading…</p>
        ) : error ? (
          <p className="text-red-600 mt-2" role="alert">{error}</p>
        ) : (
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-4 rounded-lg border">
              <div className="text-sm text-gray-500">Name</div>
              <div className="text-gray-900 font-medium">{info?.name}</div>
            </div>
            <div className="p-4 rounded-lg border">
              <div className="text-sm text-gray-500">Version</div>
              <div className="text-gray-900 font-medium">{info?.version}</div>
            </div>
            <div className="p-4 rounded-lg border">
              <div className="text-sm text-gray-500">Environment</div>
              <div className="text-gray-900 font-medium">{info?.environment}</div>
            </div>
          </div>
        )}
      </section>

      <section className="bg-white border rounded-lg p-6">
        <h2 className="text-xl font-semibold text-gray-900">Quick Links</h2>
        <ul className="list-disc pl-6 mt-3 text-primary-700">
          <li>
            <a className="hover:underline" href="/metrics" target="_blank" rel="noreferrer">/metrics</a>
          </li>
          <li>
            <a className="hover:underline" href="/health" target="_blank" rel="noreferrer">/health</a>
          </li>
        </ul>
      </section>
    </div>
  )
}
