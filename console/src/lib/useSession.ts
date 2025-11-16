"use client"

import { useMemo, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import { apiClient, AUTH_UNAUTHORIZED_EVENT } from './api-client'
import { clearInvoicePdfCache } from './billing'
import { readXsrfCookie } from './csrf'

export type SessionUser = {
  userId: string
  publisherId: string
  email: string
  role?: 'admin' | 'publisher' | 'readonly'
  permissions?: string[]
  locale?: string | null
}

type UseSessionOptions = {
  redirectOnUnauthorized?: boolean
  redirectOnLogout?: boolean
  loginPath?: string
}

const DEFAULT_LOGIN_PATH = '/login'

function resolveSessionScope(): string {
  if (typeof window === 'undefined') return 'ssr'
  const cookie = readXsrfCookie()
  if (cookie) return `client:${cookie.slice(-12)}`
  return `client:${window.location.host}`
}

export function useSession(options?: UseSessionOptions) {
  const {
    redirectOnUnauthorized = true,
    redirectOnLogout = true,
    loginPath = DEFAULT_LOGIN_PATH,
  } = options ?? {}

  const router = useRouter()
  const queryClient = useQueryClient()
  const sessionScope = useMemo(() => resolveSessionScope(), [])
  const sessionQueryKey = useMemo(() => ['session', 'me', sessionScope] as const, [sessionScope])

  const query = useQuery({
    queryKey: sessionQueryKey,
    queryFn: async (): Promise<SessionUser | null> => {
      try {
        const res = await apiClient.get('/auth/me')
        if (res?.data?.success) return res.data.data as SessionUser
        return null
      } catch (error) {
        if (axios.isAxiosError(error) && error.response?.status === 401) {
          return null
        }
        throw error
      }
    },
    retry: false,
    staleTime: 5 * 60 * 1000,
  })

  useEffect(() => {
    if (typeof window === 'undefined') return

    const handleUnauthorized = () => {
      queryClient.setQueryData(sessionQueryKey, null)
      if (!redirectOnUnauthorized) return

      const nextPath = window.location.pathname + window.location.search + window.location.hash
      if (nextPath.startsWith(loginPath)) return
      router.replace(`${loginPath}?next=${encodeURIComponent(nextPath)}`)
    }

    window.addEventListener(AUTH_UNAUTHORIZED_EVENT, handleUnauthorized)
    return () => window.removeEventListener(AUTH_UNAUTHORIZED_EVENT, handleUnauthorized)
  }, [loginPath, queryClient, redirectOnUnauthorized, router, sessionQueryKey])

  const logout = useMutation({
    mutationKey: ['session', 'logout', sessionScope],
    mutationFn: async () => {
      await apiClient.post('/auth/logout')
    },
    onSuccess: async () => {
      queryClient.setQueryData(sessionQueryKey, null)
      clearInvoicePdfCache()
      await queryClient.invalidateQueries({ queryKey: sessionQueryKey })
      if (redirectOnLogout && typeof window !== 'undefined') {
        const nextPath = window.location.pathname + window.location.search + window.location.hash
        router.push(`${loginPath}?next=${encodeURIComponent(nextPath)}`)
      }
    },
  })

  return {
    user: query.data ?? null,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
    logout,
    queryKey: sessionQueryKey,
  }
}
