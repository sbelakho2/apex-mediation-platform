"use client"

import { useCallback, useEffect, useMemo, useState } from 'react'
import { apiClient, handleApiError } from '@/lib/api-client'

const DEFAULT_ENDPOINT = '/meta/features'
const API_SUFFIX = '/api/v1/meta/features'

const isAbortError = (error: unknown) => {
  if (!error) return false
  const err = error as Record<string, any>
  return err?.name === 'AbortError' || err?.name === 'CanceledError' || err?.code === 'ERR_CANCELED' || err?.message === 'canceled'
}

type Features = {
  transparency?: boolean
  billing?: boolean
  fraudDetection?: boolean
  abTesting?: boolean
  migrationStudio?: boolean
}

type Options = {
  fallback?: Pick<Features, 'transparency' | 'billing' | 'migrationStudio'>
  apiBaseUrl?: string
  endpoint?: string
}

export function useFeatures(options: Options = {}) {
  const [features, setFeatures] = useState<Features | null>(options.fallback || null)
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<Error | null>(null)
  const [refreshToken, setRefreshToken] = useState(0)

  const endpoint = useMemo(() => {
    if (options.endpoint) return options.endpoint
    if (options.apiBaseUrl) {
      const normalized = options.apiBaseUrl.replace(/\/$/, '')
      const hasApiSegment = /\/api(\/v\d+)?$/.test(normalized)
      return `${normalized}${hasApiSegment ? '/meta/features' : API_SUFFIX}`
    }
    return DEFAULT_ENDPOINT
  }, [options.apiBaseUrl, options.endpoint])

  const refresh = useCallback(() => {
    setRefreshToken((token) => token + 1)
  }, [])

  useEffect(() => {
    let isMounted = true
    const controller = new AbortController()

    async function load() {
      setLoading(true)
      try {
        const response = await apiClient.get(endpoint, {
          signal: controller.signal,
          headers: {
            'Cache-Control': 'no-cache',
          },
        })
        if (!isMounted) return
        const payload = response?.data?.data ?? response?.data ?? null
        setFeatures(payload)
        setError(null)
      } catch (err: any) {
        if (!isMounted || isAbortError(err)) return
        const message = handleApiError(err)
        setError(new Error(message))
      } finally {
        if (isMounted) {
          setLoading(false)
        }
      }
    }

    load()
    return () => {
      isMounted = false
      controller.abort()
    }
  }, [endpoint, refreshToken])

  return { features, loading, error, refresh }
}
