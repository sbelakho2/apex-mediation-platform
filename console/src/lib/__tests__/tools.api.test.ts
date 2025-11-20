import { toolsApi } from '@/lib/api'

jest.mock('@/lib/api-client', () => {
  const get = jest.fn()
  return {
    apiClient: { get },
    fraudApiClient: { get: jest.fn() },
    analyticsApiClient: { get: jest.fn() },
  }
})

describe('toolsApi.inspectAppAds', () => {
  const { apiClient } = jest.requireMock('@/lib/api-client') as any

  beforeEach(() => {
    jest.resetAllMocks()
  })

  it('calls backend endpoint with domain and returns result', async () => {
    const payload = {
      domain: 'example.com',
      fetched: true,
      httpStatus: 200,
      vendors: [
        { vendor: 'admob', pass: true, missing: [], suggested: [] },
      ],
      rawSample: 'google.com, pub-xxx, DIRECT, f08c47fec0942fa0',
    }
    ;(apiClient.get as jest.Mock).mockResolvedValueOnce({ data: payload })
    const res = await toolsApi.inspectAppAds('example.com')
    expect(apiClient.get).toHaveBeenCalledWith('/tools/app-ads-inspector', { params: { domain: 'example.com' } })
    expect(res.domain).toBe('example.com')
    expect(res.vendors[0].vendor).toBe('admob')
  })

  it('throws on empty domain', async () => {
    await expect(toolsApi.inspectAppAds('')).rejects.toThrow('Domain is required')
  })
})
