'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SessionProvider } from 'next-auth/react'
import { useState } from 'react'
import { useEffect } from 'react'
import { getCsrfToken } from '@/lib/csrf'

export function Providers({ children }: { children: React.ReactNode }) {
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
        {/* Bootstrap CSRF token cookie on initial mount for mutating requests */}
        <BootstrapCsrf />
        {children}
      </QueryClientProvider>
    </SessionProvider>
  )
}

function BootstrapCsrf() {
  useEffect(() => {
    let cancelled = false
    const prime = async () => {
      try {
        await getCsrfToken()
      } catch (error) {
        if (!cancelled) {
          console.warn('[csrf] Unable to prime CSRF token', error)
        }
      }
    }
    if (typeof window !== 'undefined') {
      void prime()
    }
    return () => {
      cancelled = true
    }
  }, [])
  return null
}
