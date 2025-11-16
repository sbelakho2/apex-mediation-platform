import { apiClient } from '../api-client'
import {
  getCurrentUsage,
  listInvoices,
  getInvoice,
  downloadInvoicePDF,
  reconcileBilling,
  resendInvoiceEmail,
  getFeatureFlags,
  clearInvoicePdfCache,
  INVOICE_PDF_CACHE_MAX_ENTRIES,
} from '../billing'
import { AxiosResponse } from 'axios'

jest.mock('../api-client')

const mockedApiClient = apiClient as jest.Mocked<typeof apiClient>
const originalCreateObjectURL = global.URL.createObjectURL
const originalRevokeObjectURL = global.URL.revokeObjectURL

const buildAxiosResponse = <T>(overrides: Partial<AxiosResponse<T>> & { data: T }): AxiosResponse<T> => ({
  data: overrides.data,
  status: overrides.status ?? 200,
  statusText: overrides.statusText ?? 'OK',
  headers: overrides.headers ?? {},
  config: overrides.config ?? ({} as any),
  request: overrides.request,
})

describe('Billing API Client', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    clearInvoicePdfCache()
    global.URL.createObjectURL = jest.fn(() => 'blob:mock-url')
    global.URL.revokeObjectURL = jest.fn()
  })

  afterAll(() => {
    global.URL.createObjectURL = originalCreateObjectURL
    global.URL.revokeObjectURL = originalRevokeObjectURL
  })

  describe('getCurrentUsage', () => {
    it('should fetch current usage data', async () => {
      const mockData = {
        current_period: {
          start: '2024-01-01',
          end: '2024-02-01',
          impressions: 1000000,
          api_calls: 50000,
          data_transfer_gb: 100,
        },
        overages: {
          impressions: { amount: 0, cost: 0 },
          api_calls: { amount: 0, cost: 0 },
          data_transfer: { amount: 0, cost: 0 },
          total_overage_cost: 0,
        },
        subscription: {
          plan_type: 'indie',
          included_impressions: 5000000,
          included_api_calls: 100000,
          included_data_transfer_gb: 500,
        },
      }

      mockedApiClient.get.mockResolvedValue({ data: mockData } as AxiosResponse)

      const result = await getCurrentUsage()

      expect(mockedApiClient.get).toHaveBeenCalledWith('/billing/usage/current')
      expect(result).toEqual(mockData)
    })

    it('should handle errors', async () => {
      const error = new Error('Network error')
      mockedApiClient.get.mockRejectedValue(error)

      await expect(getCurrentUsage()).rejects.toThrow()
    })
  })

  describe('listInvoices', () => {
    it('should fetch invoices with default params', async () => {
      const mockData = {
        invoices: [
          {
            id: '1',
            invoice_number: 'INV-001',
            customer_id: 'cust_123',
            amount: 100,
            currency: 'usd',
            status: 'paid' as const,
            period_start: '2024-01-01',
            period_end: '2024-02-01',
            due_date: '2024-02-15',
            paid_at: '2024-02-10',
            stripe_invoice_id: 'in_123',
            pdf_url: null,
            created_at: '2024-02-01',
            updated_at: '2024-02-10',
          },
        ],
        pagination: {
          page: 1,
          limit: 20,
          total: 1,
          total_pages: 1,
        },
      }

      mockedApiClient.get.mockResolvedValue({ data: mockData } as AxiosResponse)

      const result = await listInvoices()

      expect(mockedApiClient.get).toHaveBeenCalledWith(
        '/billing/invoices',
        expect.objectContaining({ params: expect.objectContaining({ limit: 20 }) })
      )
      expect(result).toEqual(mockData)
    })

    it('should fetch invoices with filters', async () => {
      const mockData = {
        invoices: [],
        pagination: { page: 2, limit: 10, total: 0, total_pages: 0 },
      }

      mockedApiClient.get.mockResolvedValue({ data: mockData } as AxiosResponse)

      const params = {
        page: 2,
        limit: 10,
        status: 'paid' as const,
        start_date: '2024-01-01',
        end_date: '2024-01-31',
      }

      await listInvoices(params)

      expect(mockedApiClient.get).toHaveBeenCalledWith('/billing/invoices', { params })
    })
  })

  describe('getInvoice', () => {
    it('should fetch a single invoice', async () => {
      const mockInvoice = {
        id: '1',
        invoice_number: 'INV-001',
        customer_id: 'cust_123',
        amount: 100,
        currency: 'usd',
        status: 'paid' as const,
        period_start: '2024-01-01',
        period_end: '2024-02-01',
        due_date: '2024-02-15',
        paid_at: '2024-02-10',
        stripe_invoice_id: 'in_123',
        pdf_url: null,
        created_at: '2024-02-01',
        updated_at: '2024-02-10',
        line_items: [
          {
            description: 'Monthly Subscription',
            quantity: 1,
            unit_amount: 100,
            amount: 100,
          },
        ],
      }

      mockedApiClient.get.mockResolvedValue({ data: mockInvoice } as AxiosResponse)

      const result = await getInvoice('1')

      expect(mockedApiClient.get).toHaveBeenCalledWith('/billing/invoices/1')
      expect(result).toEqual(mockInvoice)
    })
  })

  describe('downloadInvoicePDF', () => {
    it('should download PDF and create blob URL', async () => {
      const mockBlob = new Blob(['PDF content'], { type: 'application/pdf' })
      mockedApiClient.get.mockResolvedValue({
        data: mockBlob,
        status: 200,
        headers: {},
      } as AxiosResponse)

      // Mock URL.createObjectURL
      const mockBlobURL = 'blob:http://localhost/mock-blob-url'
      global.URL.createObjectURL = jest.fn(() => mockBlobURL)

      const result = await downloadInvoicePDF('1')

      expect(mockedApiClient.get).toHaveBeenCalledWith(
        '/billing/invoices/1/pdf',
        expect.objectContaining({
          responseType: 'blob',
          validateStatus: expect.any(Function),
        })
      )
      expect(result).toBe(mockBlobURL)
      expect(global.URL.createObjectURL).toHaveBeenCalled()
    })

    it('reuses cached urls when server returns 304 responses', async () => {
      const etag = 'etag-123'
      mockedApiClient.get
        .mockResolvedValueOnce(
          buildAxiosResponse({
            data: new Blob(['first']),
            headers: { etag },
          })
        )
        .mockResolvedValueOnce(
          buildAxiosResponse({
            data: new Blob([]),
            status: 304,
          })
        )
      ;(global.URL.createObjectURL as jest.Mock)
        .mockReturnValueOnce('blob:first')

      const first = await downloadInvoicePDF('inv-1')
      const second = await downloadInvoicePDF('inv-1')

      expect(first).toBe('blob:first')
      expect(second).toBe('blob:first')
      const secondCallConfig = mockedApiClient.get.mock.calls[1][1]
      expect(secondCallConfig?.headers?.['If-None-Match']).toBe(etag)
    })

    it('evicts the oldest cached url when exceeding the cache budget', async () => {
      mockedApiClient.get.mockImplementation((url: string) => {
        return Promise.resolve(
          buildAxiosResponse({
            data: new Blob([url]),
          })
        )
      })

      for (let i = 0; i < INVOICE_PDF_CACHE_MAX_ENTRIES + 1; i++) {
        ;(global.URL.createObjectURL as jest.Mock).mockReturnValueOnce(`blob:${i}`)
        await downloadInvoicePDF(`inv-${i}`)
      }

      expect(global.URL.revokeObjectURL).toHaveBeenCalledTimes(1)
    })

    it('supports concurrent downloads without corrupting cache state', async () => {
      mockedApiClient.get.mockResolvedValue(
        buildAxiosResponse({
          data: new Blob(['concurrent']),
        })
      )
      ;(global.URL.createObjectURL as jest.Mock)
        .mockReturnValueOnce('blob:a')
        .mockReturnValueOnce('blob:b')

      const [first, second] = await Promise.all([
        downloadInvoicePDF('inv-shared'),
        downloadInvoicePDF('inv-shared'),
      ])

      expect(first).toBe('blob:a')
      expect(second).toBe('blob:b')
      expect(mockedApiClient.get).toHaveBeenCalledTimes(2)
    })
  })

  describe('reconcileBilling', () => {
    it('should trigger reconciliation with idempotency key', async () => {
      const mockResult = {
        success: true,
        discrepancies: [],
        total_discrepancy_amount: 0,
        reconciliation_id: 'rec_123',
        timestamp: '2024-01-01T00:00:00Z',
      }

      mockedApiClient.post.mockResolvedValue({ data: mockResult } as AxiosResponse)

      const idempotencyKey = 'idem_123'
      const result = await reconcileBilling(idempotencyKey)

      expect(mockedApiClient.post).toHaveBeenCalledWith(
        '/billing/reconcile',
        {},
        {
          headers: {
            'Idempotency-Key': idempotencyKey,
          },
        }
      )
      expect(result).toEqual(mockResult)
    })
  })

  describe('resendInvoiceEmail', () => {
    it('posts invoice resend payload to the billing API', async () => {
      mockedApiClient.post.mockResolvedValue({} as AxiosResponse)

      await resendInvoiceEmail({ invoiceId: 'inv_42', email: 'ops@example.com' })

      expect(mockedApiClient.post).toHaveBeenCalledWith('/billing/invoices/resend', {
        invoiceId: 'inv_42',
        email: 'ops@example.com',
      })
    })

    it('surfaces API errors to the caller', async () => {
      mockedApiClient.post.mockRejectedValue(new Error('network'))

      await expect(resendInvoiceEmail({ invoiceId: 'inv_1', email: 'ops@example.com' })).rejects.toThrow()
    })
  })

  describe('getFeatureFlags', () => {
    it('should fetch feature flags', async () => {
      const mockData = { billingEnabled: true }
      mockedApiClient.get.mockResolvedValue({ data: mockData } as AxiosResponse)

      const result = await getFeatureFlags()

      expect(mockedApiClient.get).toHaveBeenCalledWith('/meta/features')
      expect(result).toEqual({ billingEnabled: true })
    })

    it('should return disabled when endpoint returns 404', async () => {
      mockedApiClient.get.mockRejectedValue({ response: { status: 404 } } as any)

      const result = await getFeatureFlags()

      expect(result).toEqual({ billingEnabled: false })
    })

    it('should surface network errors so regressions are visible', async () => {
      const axiosLikeError = Object.assign(new Error('Service unavailable'), {
        isAxiosError: true,
        response: { status: 503, data: { message: 'Service unavailable' } },
      })
      mockedApiClient.get.mockRejectedValue(axiosLikeError)

      await expect(getFeatureFlags()).rejects.toThrow()
    })
  })
})
