'use client'

import { useState } from 'react'
import { reconcileBilling } from '@/lib/billing'

export default function AdminBillingOpsPage() {
  const [invoiceId, setInvoiceId] = useState('')
  const [email, setEmail] = useState('')
  const [reconStatus, setReconStatus] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function triggerReconcile() {
    try {
      setLoading(true)
      setError(null)
      setReconStatus(null)
      const key = `admin-reconcile-${Date.now()}`
      const res = await reconcileBilling(key)
      setReconStatus(res?.success ? 'Reconciliation triggered successfully' : 'Reconciliation completed with discrepancies')
    } catch (e: any) {
      setError(e?.message || 'Failed to trigger reconciliation')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <section className="bg-white border rounded-lg p-6">
        <h2 className="text-xl font-semibold text-gray-900">Reconciliation</h2>
        <p className="text-gray-600 mt-2">Trigger a manual reconciliation run. Uses an Idempotency-Key to avoid duplicates.</p>
        <button
          onClick={triggerReconcile}
          disabled={loading}
          className="mt-4 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
        >
          {loading ? 'Triggering…' : 'Reconcile Now'}
        </button>
        {reconStatus && <p className="text-green-700 mt-3" role="status">{reconStatus}</p>}
        {error && <p className="text-red-600 mt-3" role="alert">{error}</p>}
      </section>

      <section className="bg-white border rounded-lg p-6">
        <h2 className="text-xl font-semibold text-gray-900">Resend Invoice Email (stub)</h2>
        <p className="text-gray-600 mt-2">Send a copy of an invoice to a billing email address.</p>
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <input
            className="border rounded px-3 py-2"
            placeholder="Invoice ID"
            value={invoiceId}
            onChange={(e) => setInvoiceId(e.target.value)}
          />
          <input
            className="border rounded px-3 py-2"
            placeholder="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <button
          className="mt-4 px-4 py-2 border rounded-lg text-sm text-gray-800 hover:bg-gray-50 disabled:opacity-50"
          disabled
          title="Stub UI — implement backend endpoint to enable"
        >
          Resend Email (coming soon)
        </button>
      </section>

      <section className="bg-white border rounded-lg p-6 lg:col-span-2">
        <h2 className="text-xl font-semibold text-gray-900">Stripe Portal</h2>
        <p className="text-gray-600 mt-2">Open Stripe Customer Portal for the current organization (if configured).</p>
        <a
          className="inline-block mt-4 px-4 py-2 bg-white border rounded-lg hover:bg-gray-50 text-sm"
          href="/billing/settings"
        >
          Go to Billing Settings
        </a>
      </section>
    </div>
  )
}
