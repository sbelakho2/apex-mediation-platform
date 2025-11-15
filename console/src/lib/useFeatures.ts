"use client"

import { useEffect, useState } from 'react'

type Features = {
  transparency?: boolean
  billing?: boolean
  fraudDetection?: boolean
  abTesting?: boolean
  migrationStudio?: boolean
}

type Options = {
  fallback?: Pick<Features, 'transparency' | 'billing' | 'migrationStudio'>
}

export function useFeatures(options: Options = {}) {
  const [features, setFeatures] = useState<Features | null>(options.fallback || null)
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<Error | null>(null)
  const baseUrl = process.env.NEXT_PUBLIC_API_URL || ''

  useEffect(() => {
    const controller = new AbortController()
    async function load() {
      setLoading(true)
      try {
        const base = baseUrl ? baseUrl.replace(/\/$/, '') : ''
        const endpoint = base ? `${base}/api/v1/meta/features` : '/api/v1/meta/features'
        const res = await fetch(endpoint, {
          cache: 'no-store',
          signal: controller.signal,
          credentials: 'include',
        })
        if (!res.ok) throw new Error(`Failed to load features: ${res.status}`)
        const json = await res.json()
        setFeatures(json?.data ?? null)
        setError(null)
      } catch (e: any) {
        if (e?.name === 'AbortError') return
        setError(e instanceof Error ? e : new Error('Failed to load features'))
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false)
        }
      }
    }
    load()
    return () => {
      controller.abort()
    }
  }, [baseUrl])

  return { features, loading, error }
}
