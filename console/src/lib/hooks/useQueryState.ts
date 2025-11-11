'use client'

import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { useCallback } from 'react'

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
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  const value = (searchParams.get(key) as T) || defaultValue

  const setValue = useCallback(
    (newValue: T) => {
      const params = new URLSearchParams(searchParams.toString())

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
    [key, defaultValue, searchParams, pathname, router]
  )

  return [value, setValue]
}

/**
 * Hook for managing multiple query parameters at once
 * Useful for forms with multiple filters
 * 
 * @example
 * const [filters, setFilters] = useQueryParams({
 *   status: 'all',
 *   page: '1',
 *   sort: '-created_at'
 * })
 * 
 * setFilters({ status: 'paid', page: '1' }) // Updates multiple params
 */
export function useQueryParams<T extends Record<string, string>>(
  defaults: T
): [T, (updates: Partial<T>) => void, () => void] {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  // Get current values from URL or defaults
  const values = Object.keys(defaults).reduce((acc, key) => {
    acc[key] = (searchParams.get(key) || defaults[key]) as T[typeof key]
    return acc
  }, {} as T)

  const setValues = useCallback(
    (updates: Partial<T>) => {
      const params = new URLSearchParams(searchParams.toString())

      // Update only the changed params
      Object.entries(updates).forEach(([key, value]) => {
        if (value === defaults[key as keyof T] || value === '' || value === null || value === undefined) {
          params.delete(key)
        } else {
          params.set(key, String(value))
        }
      })

      const query = params.toString()
      const url = query ? `${pathname}?${query}` : pathname

      router.replace(url, { scroll: false })
    },
    [defaults, searchParams, pathname, router]
  )

  const resetValues = useCallback(() => {
    router.replace(pathname, { scroll: false })
  }, [pathname, router])

  return [values, setValues, resetValues]
}

/**
 * Get all query parameters as an object
 */
export function useAllQueryParams(): Record<string, string> {
  const searchParams = useSearchParams()
  const params: Record<string, string> = {}

  searchParams.forEach((value, key) => {
    params[key] = value
  })

  return params
}
