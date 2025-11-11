"use client"

import { useQuery, useMutation } from '@tanstack/react-query'
import { apiClient } from './api-client'

export type SessionUser = {
  userId: string
  publisherId: string
  email: string
  role?: 'admin' | 'publisher' | 'readonly'
}

export function useSession() {
  const query = useQuery({
    queryKey: ['session','me'],
    queryFn: async (): Promise<SessionUser | null> => {
      const res = await apiClient.get('/auth/me')
      if (res?.data?.success) return res.data.data as SessionUser
      return null
    },
    retry: false,
  })

  const logout = useMutation({
    mutationKey: ['session','logout'],
    mutationFn: async () => {
      await apiClient.post('/auth/logout')
    },
  })

  return { user: query.data ?? null, isLoading: query.isLoading, error: query.error, refetch: query.refetch, logout }
}
