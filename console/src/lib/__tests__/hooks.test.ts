import { renderHook, act, waitFor } from '@testing-library/react'
import { useDebouncedValue, useLoadingState } from '../hooks'

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
