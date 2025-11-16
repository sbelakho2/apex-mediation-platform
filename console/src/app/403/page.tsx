'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { ShieldAlert, ArrowLeftCircle } from 'lucide-react'

const REDIRECT_SECONDS = 8

export default function ForbiddenPage() {
  const router = useRouter()
  const [secondsRemaining, setSecondsRemaining] = useState(REDIRECT_SECONDS)

  useEffect(() => {
    const timer = window.setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev <= 1) {
          router.replace('/dashboard')
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => {
      window.clearInterval(timer)
    }
  }, [router])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
      <div className="max-w-lg w-full text-center bg-white border border-gray-200 rounded-2xl shadow-sm p-10 space-y-6">
        <div className="flex flex-col items-center gap-4">
          <div className="h-16 w-16 rounded-full bg-danger-50 text-danger-600 flex items-center justify-center">
            <ShieldAlert className="h-8 w-8" aria-hidden={true} />
          </div>
          <div>
            <p className="text-sm uppercase tracking-wide text-danger-600 font-semibold">Access denied</p>
            <h1 className="text-3xl font-bold text-gray-900 mt-1">403 — Forbidden</h1>
          </div>
        </div>

        <p className="text-gray-600">
          You don&apos;t currently have permission to view this area. We&apos;re keeping your data safe and will redirect you to a safe page shortly.
        </p>

        <div className="space-y-2 text-sm text-gray-500">
          <p>
            Redirecting to your dashboard in <span className="font-semibold text-gray-900">{secondsRemaining}</span>{' '}
            second{secondsRemaining === 1 ? '' : 's'}.
          </p>
          <p>
            Think this is a mistake? Reach out to your admin or{' '}
            <Link href="mailto:support@apexmediation.dev" className="text-primary-600 font-medium">
              contact support
            </Link>
            .
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-center">
          <button
            type="button"
            onClick={() => router.replace('/dashboard')}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-primary-700"
          >
            <ArrowLeftCircle className="h-4 w-4" aria-hidden={true} />
            Back to dashboard
          </button>
          <Link
            href="/settings"
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            Review access settings
          </Link>
        </div>
      </div>
    </div>
  )
}
