'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'

/**
 * Hook to debounce a value with configurable delay.
 * Useful for search/filter inputs to reduce API calls.
 * 
 * @param value - The value to debounce
 * @param delay - Delay in milliseconds (default: 300)
 * @returns Debounced value
 * 
 * @example
 * const [search, setSearch] = useState('')
 * const debouncedSearch = useDebouncedValue(search, 300)
 * 
 * useEffect(() => {
 *   // API call with debouncedSearch
 * }, [debouncedSearch])
 */
export function useDebouncedValue<T>(value: T, delay: number = 300): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value)

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value)
    }, delay)

    return () => {
      clearTimeout(timer)
    }
  }, [value, delay])

  return debouncedValue
}

/**
 * Hook to sync state with URL query parameters.
 * Enables bookmarking and sharing of filtered/paginated views.
 * 
 * @returns Object with current params and update function
 * 
 * @example
 * const { params, updateParams } = useUrlQueryParams()
 * 
 * // Read from URL
 * const page = params.get('page') || '1'
 * 
 * // Update URL
 * updateParams({ page: '2', search: 'test' })
 * 
 * // Clear specific param
 * updateParams({ search: null })
 */
type UpdateParamsOptions = {
  history?: 'push' | 'replace'
  scroll?: boolean
}

export function useUrlQueryParams() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const updateParams = useCallback((updates: Record<string, string | number | null | undefined>, options: UpdateParamsOptions = {}) => {
    const nextParams = new URLSearchParams(searchParams?.toString() || '')

    Object.entries(updates).forEach(([key, value]) => {
      if (value === null || value === undefined || value === '') {
        nextParams.delete(key)
      } else {
        nextParams.set(key, String(value))
      }
    })

    const currentQuery = searchParams?.toString() || ''
    const nextQuery = nextParams.toString()
    if (nextQuery === currentQuery) return

    const url = nextQuery ? `${pathname}?${nextQuery}` : pathname
    const historyMode = options.history ?? 'replace'
    const scroll = options.scroll ?? false

    if (historyMode === 'push') {
      router.push(url, { scroll })
    } else {
      router.replace(url, { scroll })
    }
  }, [pathname, router, searchParams])

  return {
    params: searchParams,
    updateParams,
  }
}

/**
 * Hook to manage loading states with minimum display duration.
 * Prevents flash of loading spinner for fast operations.
 * 
 * @param minimumDuration - Minimum time to show loading state in ms (default: 300)
 * @returns Object with loading state and control functions
 * 
 * @example
 * const { isLoading, startLoading, stopLoading } = useLoadingState(500)
 * 
 * async function fetchData() {
 *   startLoading()
 *   const data = await api.fetch()
 *   stopLoading()
 * }
 */
export function useLoadingState(minimumDuration: number = 300) {
  const [isLoading, setIsLoading] = useState(false)
  const [startTime, setStartTime] = useState<number | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const startLoading = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    setIsLoading(true)
    setStartTime(Date.now())
  }, [])

  const stopLoading = useCallback(() => {
    if (!startTime) {
      setIsLoading(false)
      return
    }

    const elapsed = Date.now() - startTime
    const remaining = Math.max(0, minimumDuration - elapsed)
    if (timerRef.current) {
      clearTimeout(timerRef.current)
    }

    timerRef.current = setTimeout(() => {
      setIsLoading(false)
      setStartTime(null)
      timerRef.current = null
    }, remaining)
  }, [startTime, minimumDuration])

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }
  }, [])

  return {
    isLoading,
    startLoading,
    stopLoading,
  }
}
