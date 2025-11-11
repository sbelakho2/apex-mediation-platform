'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function BillingPage() {
  const router = useRouter()

  useEffect(() => {
    router.replace('/billing/usage')
  }, [router])

  return (
    <div className="p-8">
      <div className="max-w-6xl mx-auto">
        <div className="animate-pulse space-y-6">
          <div className="h-8 w-48 bg-gray-200 rounded"></div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-40 bg-gray-200 rounded-lg"></div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
