import { server } from '@/tests/msw/server'
import { http, HttpResponse } from 'msw'
import { downloadInvoicePDF } from '../billing'

// Ensure BASE_URL points to localhost API during tests
jest.mock('../api-client', () => {
  const actual = jest.requireActual('../api-client')
  return {
    ...actual,
    apiClient: actual.apiClient, // baseURL defaults to http://localhost:4000/api/v1
  }
})

describe('downloadInvoicePDF — ETag/304 handling with MSW', () => {
  const pdfEndpoint = 'http://localhost:4000/api/v1/billing/invoices/inv_1/pdf'

  beforeEach(() => {
    jest.restoreAllMocks()
  })

  it('returns cached blob URL when server responds 304 Not Modified', async () => {
    // First request: 200 with ETag
    server.use(
      http.get(pdfEndpoint, () => {
        const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]) // %PDF
        return new HttpResponse(bytes, {
          status: 200,
          headers: { 'Content-Type': 'application/pdf', ETag: 'W/"pdf-etag-xyz"' },
        })
      })
    )

    const url1 = await downloadInvoicePDF('inv_1')
    expect(typeof url1).toBe('string')
    expect(url1.startsWith('blob:')).toBe(true)

    // Second request: server returns 304 Not Modified
    server.use(
      http.get(pdfEndpoint, ({ request }) => {
        const inm = request.headers.get('if-none-match')
        // Ensure client sent our previous ETag
        expect(inm).toBe('W/"pdf-etag-xyz"')
        return new HttpResponse(null, {
          status: 304,
          headers: { ETag: 'W/"pdf-etag-xyz"', 'Content-Type': 'application/pdf' },
        })
      })
    )

    const url2 = await downloadInvoicePDF('inv_1')
    expect(url2).toBe(url1)
  })
})
