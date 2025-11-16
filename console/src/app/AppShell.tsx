'use client'

import { useMemo, type ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import Navigation from '@/components/Navigation'

const STATIC_PUBLIC_ROUTES = new Set(['/', '/login'])
const PUBLIC_ROUTE_PREFIXES = ['/auth', '/public']

function normalizePath(pathname: string | null): string {
  if (!pathname) return '/'
  if (pathname === '/') return '/'
  return pathname.replace(/\/$/, '') || '/'
}

function isPublicRoute(pathname: string | null): boolean {
  const normalized = normalizePath(pathname)
  if (STATIC_PUBLIC_ROUTES.has(normalized)) {
    return true
  }
  return PUBLIC_ROUTE_PREFIXES.some((prefix) => normalized.startsWith(prefix))
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const hideNavigation = useMemo(() => isPublicRoute(pathname), [pathname])

  if (hideNavigation) {
    return <>{children}</>
  }

  return <Navigation>{children}</Navigation>
}
