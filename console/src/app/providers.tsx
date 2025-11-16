'use client'

import { HydrationBoundary, QueryClient, QueryClientProvider, type DehydratedState } from '@tanstack/react-query'
import { SessionProvider } from 'next-auth/react'
import { useState, useEffect } from 'react'
import { CsrfFetchError, getCsrfToken, readXsrfCookie } from '@/lib/csrf'

type ProvidersProps = {
  children: React.ReactNode
  dehydratedState?: DehydratedState | undefined
}

export function Providers({ children, dehydratedState }: ProvidersProps) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000, // 1 minute
            refetchOnWindowFocus: false,
          },
        },
      })
  )

  return (
    <SessionProvider>
      <QueryClientProvider client={queryClient}>
        <HydrationBoundary state={dehydratedState}>
          {/* Bootstrap CSRF token cookie on initial mount for mutating requests */}
          <BootstrapCsrf />
          {children}
        </HydrationBoundary>
      </QueryClientProvider>
    </SessionProvider>
  )
}

function BootstrapCsrf() {
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!navigator.cookieEnabled) return
    if (readXsrfCookie()) return

    const controller = new AbortController()
    let cancelled = false

    const prime = async () => {
      try {
        await getCsrfToken({ signal: controller.signal })
      } catch (error) {
        if (cancelled) return
        const status = error instanceof CsrfFetchError ? error.status : undefined
        // Anonymous sessions may not have access yet—avoid noisy warnings.
        if (status && status >= 400 && status < 500) {
          return
        }
        console.warn('[csrf] Unable to prime CSRF token', error)
      }
    }

    void prime()

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [])
  return null
}
