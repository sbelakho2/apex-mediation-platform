'use client'

import { useMemo, type ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import Navigation from '@/components/Navigation'
import { AppShellV2 } from './AppShellV2'

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

  // Flagged cutover: when enabled, render the v2 AppShell
  const uiV2Enabled =
    process.env.NEXT_PUBLIC_UI_V2 === '1' || process.env.NEXT_PUBLIC_UI_V2 === 'true'

  if (uiV2Enabled) {
    return <AppShellV2>{children}</AppShellV2>
  }

  if (hideNavigation) {
    return <>{children}</>
  }

  return <Navigation>{children}</Navigation>
}
