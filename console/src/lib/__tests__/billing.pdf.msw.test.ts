import {
  downloadInvoicePDF,
  clearInvoicePdfCache,
  INVOICE_PDF_CACHE_TTL_MS,
} from '../billing'
import { apiClient, AUTH_UNAUTHORIZED_EVENT } from '../api-client'

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
  let dateNowSpy: jest.SpyInstance<number, []> | undefined

  beforeEach(() => {
    jest.clearAllMocks()
    mockedApiClient.get.mockReset()
    clearInvoicePdfCache()
    dateNowSpy?.mockRestore?.()
    ;(global.URL.createObjectURL as unknown as jest.Mock | undefined)?.mockClear?.()
    global.URL.createObjectURL = mockCreateObjectURL as unknown as typeof URL.createObjectURL
    global.URL.revokeObjectURL = mockRevokeObjectURL as unknown as typeof URL.revokeObjectURL
    if (typeof window !== 'undefined') {
      window.URL.createObjectURL = mockCreateObjectURL as unknown as typeof URL.createObjectURL
      window.URL.revokeObjectURL = mockRevokeObjectURL as unknown as typeof URL.revokeObjectURL
    }
  })

  afterEach(() => {
    clearInvoicePdfCache()
    dateNowSpy?.mockRestore?.()
    dateNowSpy = undefined
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

  const addEventListenerSpy = jest.spyOn(window, 'addEventListener')
  const firstUrl = await downloadInvoicePDF('inv_1')
    expect(mockCreateObjectURL).toHaveBeenCalledTimes(1)
    expect(typeof firstUrl).toBe('string')
  expect(addEventListenerSpy).toHaveBeenCalledWith(AUTH_UNAUTHORIZED_EVENT, expect.any(Function))
  addEventListenerSpy.mockRestore()

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

  it('evicts expired cache entries once the TTL passes', async () => {
    const pdfBytes = new Blob(['first'], { type: 'application/pdf' })
    const pdfBytesNew = new Blob(['second'], { type: 'application/pdf' })

    mockedApiClient.get
      .mockResolvedValueOnce({
        status: 200,
        data: pdfBytes,
        headers: { etag: 'W/"pdf-etag-first"' },
      } as any)
      .mockResolvedValueOnce({
        status: 200,
        data: pdfBytesNew,
        headers: { etag: 'W/"pdf-etag-second"' },
      } as any)

    mockCreateObjectURL.mockReturnValueOnce('blob:first').mockReturnValueOnce('blob:second')

    dateNowSpy = jest.spyOn(Date, 'now').mockReturnValue(1_700_000_000)
    const firstUrl = await downloadInvoicePDF('inv_ttl')
    expect(firstUrl).toBe('blob:first')

    dateNowSpy.mockReturnValue(1_700_000_000 + INVOICE_PDF_CACHE_TTL_MS + 1)

    const secondUrl = await downloadInvoicePDF('inv_ttl')
    expect(secondUrl).toBe('blob:second')
    expect(mockCreateObjectURL).toHaveBeenCalledTimes(2)
    expect(mockRevokeObjectURL).toHaveBeenCalledWith('blob:first')
  })

  it('clears cached blobs when the auth session becomes invalid', async () => {
    const pdfBytes = new Blob(['content'], { type: 'application/pdf' })
    const pdfBytesNew = new Blob(['refresh'], { type: 'application/pdf' })

    mockedApiClient.get
      .mockResolvedValueOnce({ status: 200, data: pdfBytes, headers: { etag: 'W/"etag"' } } as any)
      .mockResolvedValueOnce({ status: 200, data: pdfBytesNew, headers: { etag: 'W/"etag-new"' } } as any)

    mockCreateObjectURL.mockReturnValueOnce('blob:first').mockReturnValueOnce('blob:after-clear')

    const firstUrl = await downloadInvoicePDF('inv_auth')
    expect(firstUrl).toBe('blob:first')

    window.dispatchEvent(new CustomEvent(AUTH_UNAUTHORIZED_EVENT))

    const nextUrl = await downloadInvoicePDF('inv_auth')
    expect(nextUrl).toBe('blob:after-clear')
    expect(mockCreateObjectURL).toHaveBeenCalledTimes(2)
    expect(mockRevokeObjectURL).toHaveBeenCalledWith('blob:first')
  })
})
