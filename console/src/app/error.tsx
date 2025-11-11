'use client'

import React from 'react'

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html>
      <body>
        <div role="alert" aria-live="assertive" className="p-6">
          <h1 className="text-xl font-semibold">Something went wrong</h1>
          <p className="mt-2 text-sm text-gray-600">An unexpected error occurred while rendering this page.</p>
          {error?.digest && (
            <p className="mt-1 text-xs text-gray-400">Diagnostic ID: {error.digest}</p>
          )}
          <button className="mt-4 px-4 py-2 border rounded" onClick={() => reset()}>Try again</button>
        </div>
      </body>
    </html>
  )
}
