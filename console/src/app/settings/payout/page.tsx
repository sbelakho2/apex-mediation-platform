'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function PayoutSettingsPage() {
  const router = useRouter()

  useEffect(() => {
    router.replace('/settings/payouts')
  }, [router])

  return null
}
