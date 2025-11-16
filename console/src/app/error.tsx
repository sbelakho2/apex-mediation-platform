'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { AlertOctagon, Home } from 'lucide-react'

type GlobalErrorProps = {
  error: Error & { digest?: string }
  reset: () => void
}

function reportClientError(error: GlobalErrorProps['error']) {
  if (typeof window === 'undefined') return
  const payload = {
    message: error?.message ?? 'Unknown client error',
    digest: error?.digest,
    stack: error?.stack?.slice(0, 2_000),
    path: window.location?.pathname,
    timestamp: new Date().toISOString(),
  }

  const endpoint = '/api/logs/client-error'
  const body = JSON.stringify(payload)

  if (navigator?.sendBeacon) {
    navigator.sendBeacon(endpoint, body)
    return
  }

  fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    keepalive: true,
  }).catch(() => {
    // Swallow network failures—UI already communicates error state
  })
}

export default function GlobalError({ error, reset }: GlobalErrorProps) {
  useEffect(() => {
    reportClientError(error)
  }, [error])

  return (
    <html lang="en">
      <body className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
        <main className="min-h-screen flex items-center justify-center px-6 py-12">
          <div
            role="alert"
            aria-live="assertive"
            className="w-full max-w-xl rounded-2xl bg-white/95 shadow-2xl border border-slate-100 p-8"
          >
            <div className="flex items-center gap-3 text-red-600">
              <div className="h-12 w-12 rounded-full bg-red-50 flex items-center justify-center">
                <AlertOctagon className="h-6 w-6" aria-hidden="true" />
              </div>
              <div>
                <p className="text-sm font-semibold uppercase tracking-wide">Unexpected error</p>
                <h1 className="text-2xl font-semibold text-slate-900">Something went wrong</h1>
              </div>
            </div>
            <p className="mt-4 text-sm text-slate-600">
              Our team has been notified and is reviewing the issue. You can retry the previous action or head
              back to the dashboard while we investigate.
            </p>
            {error?.digest && (
              <p className="mt-3 text-xs font-mono text-slate-500">Reference ID: {error.digest}</p>
            )}
            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-primary-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600"
                onClick={() => reset()}
              >
                Try again
              </button>
              <Link
                href="/dashboard"
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                <Home className="h-4 w-4" aria-hidden="true" />
                Go to dashboard
              </Link>
            </div>
          </div>
        </main>
      </body>
    </html>
  )
}
