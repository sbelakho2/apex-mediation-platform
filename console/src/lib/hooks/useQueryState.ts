'use client'

import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { useCallback, useMemo } from 'react'

const canUseDom = () => typeof window !== 'undefined'

/**
 * Hook for managing query string parameters with React state-like interface
 * Automatically syncs with URL and handles browser back/forward
 * 
 * @example
 * const [status, setStatus] = useQueryState('status', 'all')
 * const [page, setPage] = useQueryState('page', '1')
 * 
 * setStatus('paid') // Updates URL to ?status=paid
 * setPage('2') // Updates URL to ?status=paid&page=2
 */
export function useQueryState<T extends string = string>(
  key: string,
  defaultValue: T
): [T, (value: T) => void] {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const hasDom = canUseDom()

  const searchParamsKey = hasDom ? searchParams?.toString() ?? '' : ''
  const value = hasDom ? ((searchParams?.get(key) as T) ?? defaultValue) : defaultValue

  const setValue = useCallback(
    (newValue: T) => {
      if (!hasDom) return

      const params = new URLSearchParams(searchParamsKey)

      if (newValue === defaultValue || newValue === '') {
        params.delete(key)
      } else {
        params.set(key, newValue)
      }

      const query = params.toString()
      const url = query ? `${pathname}?${query}` : pathname

      // Use replace to avoid polluting browser history with every keystroke
      router.replace(url, { scroll: false })
    },
    [defaultValue, hasDom, key, pathname, router, searchParamsKey]
  )

  return [value, setValue]
}

/**
 * Hook for managing multiple query parameters at once
 * Useful for forms with multiple filters
 * 
 * @example
 * const [filters, setFilters] = useQueryParamsState({
 *   status: 'all',
 *   page: '1',
 *   sort: '-created_at'
 * })
 * 
 * setFilters({ status: 'paid', page: '1' }) // Updates multiple params
 */
export function useQueryParamsState<T extends Record<string, string>>(
  defaults: T
): [T, (updates: Partial<T>) => void, () => void] {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const hasDom = canUseDom()
  const searchParamsKey = hasDom ? searchParams?.toString() ?? '' : ''

  const values = useMemo(() => {
    const next: T = { ...defaults }

    if (!hasDom) {
      return next
    }

    const params = new URLSearchParams(searchParamsKey)

    params.forEach((value, key) => {
      if (key in next) {
        next[key as keyof T] = value as T[keyof T]
      }
    })

    return next
  }, [defaults, hasDom, searchParamsKey])

  const setValues = useCallback(
    (updates: Partial<T>) => {
      if (!hasDom) return

      const params = new URLSearchParams(searchParamsKey)

      // Update only the changed params
      Object.entries(updates).forEach(([key, value]) => {
        const defaultValue = defaults[key as keyof T]

        if (value === defaultValue || value === '' || value === null || value === undefined) {
          params.delete(key)
        } else {
          params.set(key, String(value))
        }
      })

      const query = params.toString()
      const url = query ? `${pathname}?${query}` : pathname

      router.replace(url, { scroll: false })
    },
    [defaults, hasDom, pathname, router, searchParamsKey]
  )

  const resetValues = useCallback(() => {
    if (!hasDom) return
    router.replace(pathname, { scroll: false })
  }, [hasDom, pathname, router])

  return [values, setValues, resetValues]
}

/**
 * Get all query parameters as an object
 */
export function useAllQueryParams(): Record<string, string> {
  const searchParams = useSearchParams()
  const hasDom = canUseDom()
  const searchParamsKey = hasDom ? searchParams?.toString() ?? '' : ''

  return useMemo(() => {
    if (!hasDom) {
      return {}
    }

    const params: Record<string, string> = {}
    const parsed = new URLSearchParams(searchParamsKey)

    parsed.forEach((value, key) => {
      params[key] = value
    })

    return params
  }, [hasDom, searchParamsKey])
}
