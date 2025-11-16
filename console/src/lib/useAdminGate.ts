"use client"

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useSession } from './useSession'
import { isFeatureEnabled } from '@/lib/featureFlags'

type UseAdminGateOptions = {
  unauthenticatedRedirect?: string
  unauthorizedRedirect?: string
  disableRedirects?: boolean
}

const DEFAULT_OPTIONS: UseAdminGateOptions = {
  unauthenticatedRedirect: '/login',
  unauthorizedRedirect: '/403',
  disableRedirects: false,
}

export function useAdminGate(options?: UseAdminGateOptions) {
  const { unauthenticatedRedirect, unauthorizedRedirect, disableRedirects } = {
    ...DEFAULT_OPTIONS,
    ...options,
  } as Required<UseAdminGateOptions>

  const { user, isLoading } = useSession({ redirectOnUnauthorized: false, loginPath: unauthenticatedRedirect })
  const router = useRouter()
  const pathname = usePathname()
  const [isClient, setIsClient] = useState(false)
  const lastRedirectRef = useRef<string | null>(null)
  const guardEnabled = isFeatureEnabled('requireAdminGuard')

  useEffect(() => {
    setIsClient(true)
  }, [])

  const redirect = useCallback((target: string, reason: string) => {
    if (!guardEnabled || disableRedirects || typeof window === 'undefined') return
    if (lastRedirectRef.current === reason) return
    if (pathname === target) return
    lastRedirectRef.current = reason
    router.replace(target)
  }, [disableRedirects, guardEnabled, pathname, router])

  useEffect(() => {
    if (!isClient || isLoading || !guardEnabled) return

    if (!user) {
      redirect(buildLoginRedirect(unauthenticatedRedirect), 'login')
      return
    }

    if (user.role !== 'admin') {
      redirect(unauthorizedRedirect!, 'forbidden')
      return
    }

    lastRedirectRef.current = null
  }, [guardEnabled, isClient, isLoading, redirect, unauthenticatedRedirect, unauthorizedRedirect, user])

  return {
    user,
    isAdmin: user?.role === 'admin' || false,
    isLoading: isLoading || !isClient,
  }
}

function buildLoginRedirect(loginPath: string) {
  if (typeof window === 'undefined') return loginPath
  const nextPath = window.location.pathname + window.location.search + window.location.hash
  if (nextPath.startsWith(loginPath)) return loginPath
  return `${loginPath}?next=${encodeURIComponent(nextPath)}`
}
