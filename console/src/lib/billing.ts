import { apiClient, handleApiError } from './api-client'
import { AxiosResponse } from 'axios'

/**
 * Billing API Client
 * Provides methods for interacting with billing endpoints
 */

export interface UsageData {
  current_period: {
    start: string
    end: string
    impressions: number
    api_calls: number
    data_transfer_gb: number
  }
  overages: {
    impressions: { amount: number; cost: number }
    api_calls: { amount: number; cost: number }
    data_transfer: { amount: number; cost: number }
    total_overage_cost: number
  }
  subscription: {
    plan_type: string
    included_impressions: number
    included_api_calls: number
    included_data_transfer_gb: number
  }
}

export interface Invoice {
  id: string
  invoice_number: string
  customer_id: string
  amount: number
  currency: string
  status: 'draft' | 'open' | 'paid' | 'void' | 'uncollectible'
  period_start: string
  period_end: string
  due_date: string
  paid_at: string | null
  stripe_invoice_id: string | null
  pdf_url: string | null
  created_at: string
  updated_at: string
  line_items?: InvoiceLineItem[]
}

export interface InvoiceLineItem {
  description: string
  quantity: number
  unit_amount: number
  amount: number
}

export interface InvoicesListResponse {
  invoices: Invoice[]
  pagination: {
    page: number
    limit: number
    total: number
    total_pages: number
  }
}

export type InvoicesQueryParams = {
  page?: number
  limit?: number
  status?: 'draft' | 'open' | 'paid' | 'void' | 'uncollectible'
  start_date?: string
  end_date?: string
}

export interface ReconciliationResult {
  success: boolean
  discrepancies: Array<{
    subscription_id: string
    metric: string
    internal_value: number
    stripe_value: number
    difference: number
    percentage_diff: number
  }>
  total_discrepancy_amount: number
  reconciliation_id: string
  timestamp: string
}

/**
 * Get current usage and overages for the authenticated user
 */
export async function getCurrentUsage(): Promise<UsageData> {
  try {
    const response: AxiosResponse<UsageData> = await apiClient.get('/billing/usage/current')
    return response.data
  } catch (error) {
    throw new Error(handleApiError(error))
  }
}

/**
 * List invoices with optional filters
 */
export async function listInvoices(params: InvoicesQueryParams = {}): Promise<InvoicesListResponse> {
  try {
    const response: AxiosResponse<InvoicesListResponse> = await apiClient.get('/billing/invoices', {
      params: {
        limit: 20,
        ...params,
      },
    })
    return response.data
  } catch (error) {
    throw new Error(handleApiError(error))
  }
}

/**
 * Get a single invoice by ID
 */
export async function getInvoice(invoiceId: string, options: { signal?: AbortSignal } = {}): Promise<Invoice> {
  try {
    const response: AxiosResponse<Invoice> = await apiClient.get(`/billing/invoices/${invoiceId}`, {
      signal: options.signal,
    })
    return response.data
  } catch (error) {
    throw new Error(handleApiError(error))
  }
}

/**
 * Download invoice PDF
 * Returns a blob URL that can be used in an anchor tag or iframe
 */
// Simple in-memory client-side cache for ETag → blob URL per invoice
const invoicePdfCache: Map<string, { etag: string; url: string }> = new Map()

export async function downloadInvoicePDF(invoiceId: string): Promise<string> {
  try {
    const cached = invoicePdfCache.get(invoiceId)
    const headers: Record<string, string> = {}
    if (cached?.etag) {
      headers['If-None-Match'] = cached.etag
    }

    const response = await apiClient.get(`/billing/invoices/${invoiceId}/pdf`, {
      responseType: 'blob',
      // @ts-ignore axios accepts headers at this level
      headers,
      validateStatus: (s) => [200, 304].includes(s || 0),
    })

    if (response.status === 304 && cached) {
      return cached.url
    }

    const etag = String((response.headers as any)?.etag || '')
    const blob = new Blob([response.data], { type: 'application/pdf' })
    const objectUrl = URL.createObjectURL(blob)
    if (etag) {
      if (cached?.url && cached.url !== objectUrl) {
        try {
          URL.revokeObjectURL(cached.url)
        } catch {}
      }
      invoicePdfCache.set(invoiceId, { etag, url: objectUrl })
    }
    return objectUrl
  } catch (error) {
    throw new Error(handleApiError(error))
  }
}

/**
 * Trigger billing reconciliation (admin only)
 */
export async function reconcileBilling(idempotencyKey: string): Promise<ReconciliationResult> {
  try {
    const response: AxiosResponse<ReconciliationResult> = await apiClient.post(
      '/billing/reconcile',
      {},
      {
        headers: {
          'Idempotency-Key': idempotencyKey,
        },
      }
    )
    return response.data
  } catch (error) {
    throw new Error(handleApiError(error))
  }
}

/**
 * Check if billing features are enabled
 */
export async function getFeatureFlags(): Promise<{ billingEnabled: boolean }> {
  try {
    const response = await apiClient.get('/meta/features')
    return {
      billingEnabled: response.data.billingEnabled || false,
    }
  } catch (error) {
    // If feature endpoint doesn't exist, assume billing is disabled
    return { billingEnabled: false }
  }
}
