"use client"

import { useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useSession } from './useSession'

export function useAdminGate() {
  const { user, isLoading } = useSession()
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    if (isLoading) return
    if (!user) {
      // Not authenticated → go to login
      router.replace('/login')
      return
    }
    if (user.role !== 'admin') {
      // Non-admin → send to 403 page or home
      if (pathname !== '/403') router.replace('/403')
    }
  }, [user, isLoading, router, pathname])

  return { user, isLoading, isAdmin: user?.role === 'admin' }
}
