import { downloadInvoicePDF } from '../billing'
import { apiClient } from '../api-client'

jest.mock('../api-client', () => {
  const original = jest.requireActual('../api-client')
  return {
    ...original,
    apiClient: {
      get: jest.fn(),
    },
  }
})

const mockedApiClient = apiClient as jest.Mocked<typeof apiClient>

describe('downloadInvoicePDF — caching behaviour', () => {
  const mockCreateObjectURL = jest.fn(() => 'blob:http://localhost/mock-pdf')
  const mockRevokeObjectURL = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
    mockedApiClient.get.mockReset()
    ;(global.URL.createObjectURL as unknown as jest.Mock | undefined)?.mockClear?.()
    global.URL.createObjectURL = mockCreateObjectURL as unknown as typeof URL.createObjectURL
    global.URL.revokeObjectURL = mockRevokeObjectURL as unknown as typeof URL.revokeObjectURL
    if (typeof window !== 'undefined') {
      window.URL.createObjectURL = mockCreateObjectURL as unknown as typeof URL.createObjectURL
      window.URL.revokeObjectURL = mockRevokeObjectURL as unknown as typeof URL.revokeObjectURL
    }
  })

  it('returns cached blob URL when server responds 304 Not Modified', async () => {
    const pdfBytes = new Blob([new Uint8Array([0x25, 0x50, 0x44, 0x46])], {
      type: 'application/pdf',
    })

    mockedApiClient.get
      .mockResolvedValueOnce({
        status: 200,
        data: pdfBytes,
        headers: { etag: 'W/"pdf-etag-xyz"' },
      } as any)
      .mockResolvedValueOnce({
        status: 304,
        data: new Blob(),
        headers: { etag: 'W/"pdf-etag-xyz"' },
      } as any)

    const firstUrl = await downloadInvoicePDF('inv_1')
    expect(mockCreateObjectURL).toHaveBeenCalledTimes(1)
    expect(typeof firstUrl).toBe('string')

    const secondUrl = await downloadInvoicePDF('inv_1')
    expect(secondUrl).toBe(firstUrl)
    expect(mockCreateObjectURL).toHaveBeenCalledTimes(1)

    expect(mockedApiClient.get).toHaveBeenNthCalledWith(
      1,
      '/billing/invoices/inv_1/pdf',
      expect.objectContaining({
        responseType: 'blob',
        headers: {},
      })
    )

    expect(mockedApiClient.get).toHaveBeenNthCalledWith(
      2,
      '/billing/invoices/inv_1/pdf',
      expect.objectContaining({
        responseType: 'blob',
        headers: expect.objectContaining({ 'If-None-Match': 'W/"pdf-etag-xyz"' }),
      })
    )
  })
})
