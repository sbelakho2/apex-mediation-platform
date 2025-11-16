import React from 'react'
import { act, render } from '@testing-library/react'
import { useFeatures } from '../useFeatures'
import { apiClient, handleApiError } from '@/lib/api-client'

jest.mock('@/lib/api-client', () => ({
  apiClient: { get: jest.fn() },
  handleApiError: jest.fn((error: unknown) => (error instanceof Error ? error.message : 'Request failed')),
}))

const mockedClient = apiClient as unknown as { get: jest.Mock }
const mockedHandleApiError = handleApiError as jest.Mock

type HookProps = Parameters<typeof useFeatures>[0]

function FeatureHarness({ hookProps }: { hookProps?: HookProps }) {
  const { features, loading, error, refresh } = useFeatures(hookProps)
  return (
    <div>
      <span data-testid="loading">{loading ? 'loading' : 'idle'}</span>
      <span data-testid="features">{features ? `ready:${JSON.stringify(features)}` : 'empty'}</span>
      <span data-testid="error">{error ? `error:${error.message}` : 'no-error'}</span>
      <button data-testid="refresh" onClick={refresh}>
        refresh
      </button>
    </div>
  )
}

describe('useFeatures', () => {
  beforeEach(() => {
    mockedClient.get.mockReset()
    mockedHandleApiError.mockReset()
    mockedHandleApiError.mockImplementation((error: unknown) =>
      error instanceof Error ? error.message : 'Request failed',
    )
  })

  it('fetches features from the backend client', async () => {
    mockedClient.get.mockResolvedValueOnce({ data: { data: { billing: true } } })

    const { findByText } = render(<FeatureHarness />)

    await findByText('ready:{"billing":true}')
    await findByText('idle')

    expect(mockedClient.get).toHaveBeenCalledWith(
      '/meta/features',
      expect.objectContaining({
        signal: expect.any(Object),
        headers: expect.objectContaining({ 'Cache-Control': 'no-cache' }),
      }),
    )
  })

  it('honors a custom apiBaseUrl override', async () => {
    mockedClient.get.mockResolvedValueOnce({ data: { data: null } })

    render(<FeatureHarness hookProps={{ apiBaseUrl: 'https://api.example.com' }} />)
    await act(async () => {
      await Promise.resolve()
    })

    expect(mockedClient.get).toHaveBeenCalledWith(
      'https://api.example.com/api/v1/meta/features',
      expect.any(Object),
    )
  })

  it('supports manual refreshes', async () => {
    mockedClient.get
      .mockResolvedValueOnce({ data: { data: { billing: true } } })
      .mockResolvedValueOnce({ data: { data: { billing: false } } })

    const { findByText, findByTestId } = render(<FeatureHarness />)

    await findByText('ready:{"billing":true}')

    const refreshButton = await findByTestId('refresh')
    await act(async () => {
      refreshButton.click()
    })

    await findByText('ready:{"billing":false}')
    expect(mockedClient.get).toHaveBeenCalledTimes(2)
  })

  it('surfaces API errors via handleApiError', async () => {
    const networkError = new Error('Network down')
    mockedClient.get.mockRejectedValueOnce(networkError)
    mockedHandleApiError.mockReturnValueOnce('Feature API unavailable')

    const { findByText } = render(<FeatureHarness />)

    await findByText('error:Feature API unavailable')
    expect(mockedHandleApiError).toHaveBeenCalledWith(networkError)
  })
})
