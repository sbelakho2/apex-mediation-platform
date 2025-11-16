import { renderHook, act, waitFor } from '@testing-library/react'
import { useDebouncedValue, useLoadingState, useUrlQueryParams } from '../hooks'
import { useQueryParamsState, useQueryState, useAllQueryParams } from '../hooks/useQueryState'

const mockRouterReplace = jest.fn()
const mockRouterPush = jest.fn()
let mockPathname = '/tests'
let mockSearchParamsString = ''

const setMockSearchParams = (value: string) => {
  mockSearchParamsString = value
}

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: mockRouterReplace,
    push: mockRouterPush,
  }),
  usePathname: () => mockPathname,
  useSearchParams: () => {
    const params = new URLSearchParams(mockSearchParamsString)

    return {
      get: params.get.bind(params),
      has: params.has.bind(params),
      toString: () => params.toString(),
      entries: params.entries.bind(params),
      forEach: params.forEach.bind(params),
      keys: params.keys.bind(params),
      values: params.values.bind(params),
      [Symbol.iterator]: params[Symbol.iterator].bind(params),
    } as unknown as URLSearchParams
  },
}))

beforeEach(() => {
  mockRouterReplace.mockReset()
  mockRouterPush.mockReset()
  mockPathname = '/tests'
  mockSearchParamsString = ''
})

describe('useDebouncedValue', () => {
  beforeEach(() => {
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('returns initial value immediately', () => {
    const { result } = renderHook(() => useDebouncedValue('test', 300))
    expect(result.current).toBe('test')
  })

  it('debounces value changes', async () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebouncedValue(value, 300),
      { initialProps: { value: 'initial' } }
    )

    expect(result.current).toBe('initial')

    rerender({ value: 'updated' })
    expect(result.current).toBe('initial') // Still old value

    act(() => {
      jest.advanceTimersByTime(300)
    })

    await waitFor(() => {
      expect(result.current).toBe('updated')
    })
  })

  it('cancels pending updates on rapid changes', async () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebouncedValue(value, 300),
      { initialProps: { value: 'first' } }
    )

    rerender({ value: 'second' })
    act(() => {
      jest.advanceTimersByTime(100)
    })

    rerender({ value: 'third' })
    act(() => {
      jest.advanceTimersByTime(100)
    })

    rerender({ value: 'final' })
    act(() => {
      jest.advanceTimersByTime(300)
    })

    await waitFor(() => {
      expect(result.current).toBe('final')
    })
  })

  it('works with custom delay', async () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebouncedValue(value, 500),
      { initialProps: { value: 'initial' } }
    )

    rerender({ value: 'updated' })

    act(() => {
      jest.advanceTimersByTime(400)
    })
    expect(result.current).toBe('initial')

    act(() => {
      jest.advanceTimersByTime(100)
    })

    await waitFor(() => {
      expect(result.current).toBe('updated')
    })
  })
})

describe('useUrlQueryParams', () => {
  it('reads current params and pushes updates', () => {
    setMockSearchParams('page=1')

    const { result } = renderHook(() => useUrlQueryParams())

    expect(result.current.params?.get('page')).toBe('1')

    act(() => {
      result.current.updateParams({ page: 2, status: 'pending' })
    })

    expect(mockRouterReplace).toHaveBeenCalledWith('/tests?page=2&status=pending', {
      scroll: false,
    })
  })

  it('removes params when null/empty values provided', () => {
    setMockSearchParams('page=2&status=pending')

    const { result } = renderHook(() => useUrlQueryParams())

    act(() => {
      result.current.updateParams({ status: null, empty: '' })
    })

    expect(mockRouterReplace).toHaveBeenCalledWith('/tests?page=2', { scroll: false })
  })

  it('uses history push when requested and avoids duplicate updates', () => {
    setMockSearchParams('page=2')

    const { result } = renderHook(() => useUrlQueryParams())

    act(() => {
      result.current.updateParams({ page: 2 }, { history: 'push', scroll: true })
    })

    expect(mockRouterPush).not.toHaveBeenCalled()
    expect(mockRouterReplace).not.toHaveBeenCalled()

    act(() => {
      result.current.updateParams({ page: 3 }, { history: 'push', scroll: true })
    })

    expect(mockRouterPush).toHaveBeenCalledWith('/tests?page=3', { scroll: true })
  })
})

describe('useLoadingState', () => {
  beforeEach(() => {
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('initializes with loading false', () => {
    const { result } = renderHook(() => useLoadingState())
    expect(result.current.isLoading).toBe(false)
  })

  it('sets loading true when started', () => {
    const { result } = renderHook(() => useLoadingState())

    act(() => {
      result.current.startLoading()
    })

    expect(result.current.isLoading).toBe(true)
  })

  it('sets loading false when stopped', async () => {
    const { result } = renderHook(() => useLoadingState(0))

    act(() => {
      result.current.startLoading()
    })

    expect(result.current.isLoading).toBe(true)

    act(() => {
      result.current.stopLoading()
    })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })
  })

  it('enforces minimum loading duration', async () => {
    const { result } = renderHook(() => useLoadingState(500))

    act(() => {
      result.current.startLoading()
    })

    // Try to stop immediately
    act(() => {
      result.current.stopLoading()
    })

    // Should still be loading
    expect(result.current.isLoading).toBe(true)

    // Advance time to minimum duration
    act(() => {
      jest.advanceTimersByTime(500)
    })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })
  })

  it('extends loading if operation takes longer than minimum', async () => {
    const { result } = renderHook(() => useLoadingState(300))

    act(() => {
      result.current.startLoading()
    })

    // Wait longer than minimum
    act(() => {
      jest.advanceTimersByTime(500)
    })

    act(() => {
      result.current.stopLoading()
    })

    // Should stop immediately since minimum already passed
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })
  })
})

describe('useQueryState', () => {
  it('returns default value when query param is missing', () => {
    setMockSearchParams('')

    const { result } = renderHook(() =>
      useQueryState<'all' | 'pending' | 'paid'>('status', 'all')
    )

    expect(result.current[0]).toBe('all')
  })

  it('prefers URL values and prunes defaults when setting state', () => {
    setMockSearchParams('status=pending&page=2')

    const { result } = renderHook(() =>
      useQueryState<'all' | 'pending' | 'paid'>('status', 'all')
    )

    expect(result.current[0]).toBe('pending')

    act(() => {
      result.current[1]('paid')
    })

    expect(mockRouterReplace).toHaveBeenCalledWith('/tests?status=paid&page=2', {
      scroll: false,
    })

    act(() => {
      result.current[1]('all')
    })

    expect(mockRouterReplace).toHaveBeenLastCalledWith('/tests?page=2', {
      scroll: false,
    })
  })
})

describe('useQueryParamsState', () => {
  const defaults: { status: string; page: string } = { status: 'all', page: '1' }

  it('merges defaults with current URL params', () => {
    setMockSearchParams('status=paid&page=3')

    const { result } = renderHook(() => useQueryParamsState(defaults))

    expect(result.current[0]).toEqual({ status: 'paid', page: '3' })
  })

  it('memoizes values while the query string is unchanged', () => {
    setMockSearchParams('status=paid')

    const { result, rerender } = renderHook(() => useQueryParamsState(defaults))

    const initialValues = result.current[0]

    rerender()
    expect(result.current[0]).toBe(initialValues)

    setMockSearchParams('status=paid&page=3')
    rerender()

    expect(result.current[0]).not.toBe(initialValues)
    expect(result.current[0]).toEqual({ status: 'paid', page: '3' })
  })

  it('updates router when filters change and prunes defaults', () => {
    setMockSearchParams('status=paid&page=3')

    const { result } = renderHook(() => useQueryParamsState(defaults))

    act(() => {
      result.current[1]({ status: 'all', page: '2' })
    })

    expect(mockRouterReplace).toHaveBeenCalledWith('/tests?page=2', { scroll: false })

    act(() => {
      result.current[2]()
    })

    expect(mockRouterReplace).toHaveBeenLastCalledWith('/tests', { scroll: false })
  })
})

describe('useAllQueryParams', () => {
  it('returns a memoized map of query parameters', () => {
    setMockSearchParams('status=paid&page=5')

    const { result, rerender } = renderHook(() => useAllQueryParams())

    expect(result.current).toEqual({ status: 'paid', page: '5' })

    const initial = result.current
    rerender()
    expect(result.current).toBe(initial)

    setMockSearchParams('page=1')
    rerender()
    expect(result.current).toEqual({ page: '1' })
  })
})
