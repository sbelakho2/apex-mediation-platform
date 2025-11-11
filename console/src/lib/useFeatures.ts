"use client"

import { useEffect, useState } from 'react'

type Features = {
  transparency?: boolean
  billing?: boolean
  fraudDetection?: boolean
  abTesting?: boolean
}

type Options = {
  fallback?: Pick<Features, 'transparency' | 'billing'>
}

export function useFeatures(options: Options = {}) {
  const [features, setFeatures] = useState<Features | null>(options.fallback || null)
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      try {
        const res = await fetch('/api/v1/meta/features', { cache: 'no-store' })
        if (!res.ok) throw new Error(`Failed to load features: ${res.status}`)
        const json = await res.json()
        if (!cancelled) {
          setFeatures(json?.data ?? null)
          setError(null)
        }
      } catch (e: any) {
        if (!cancelled) setError(e)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  return { features, loading, error }
}
