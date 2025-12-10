import { apiClient, handleApiError, AUTH_UNAUTHORIZED_EVENT } from './api-client'
import type { AxiosResponse, AxiosError } from 'axios'
import type { PlatformTierId } from './platformTiers'

export const INVOICE_PDF_CACHE_TTL_MS = 10 * 60 * 1000 // 10 minutes
export const INVOICE_PDF_CACHE_MAX_ENTRIES = 25

type PdfCacheEntry = {
  invoiceId: string
  etag?: string
  url: string
  expiresAt: number
  revocable: boolean
}

const invoicePdfCache: Map<string, PdfCacheEntry> = new Map()

let unauthorizedListenerRegistered = false

const supportsObjectUrls = () => typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function'

const registerUnauthorizedCacheInvalidation = () => {
  if (unauthorizedListenerRegistered || typeof window === 'undefined') return
  window.addEventListener(AUTH_UNAUTHORIZED_EVENT, clearInvoicePdfCache)
  unauthorizedListenerRegistered = true
}

const revokeEntry = (entry?: PdfCacheEntry) => {
  if (!entry?.revocable) return
  try {
    if (typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
      URL.revokeObjectURL(entry.url)
    }
  } catch {}
}

const pruneExpiredEntries = () => {
  const now = Date.now()
  for (const [invoiceId, entry] of invoicePdfCache.entries()) {
    if (entry.expiresAt <= now) {
      revokeEntry(entry)
      invoicePdfCache.delete(invoiceId)
    }
  }
}

const ensureCacheBudget = () => {
  if (invoicePdfCache.size < INVOICE_PDF_CACHE_MAX_ENTRIES) return
  const oldestKey = invoicePdfCache.keys().next().value as string | undefined
  if (!oldestKey) return
  const entry = invoicePdfCache.get(oldestKey)
  revokeEntry(entry)
  invoicePdfCache.delete(oldestKey)
}

const blobToDataUrl = async (blob: Blob): Promise<string> => {
  if (typeof FileReader !== 'undefined') {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onerror = () => reject(reader.error)
      reader.onloadend = () => resolve(String(reader.result))
      reader.readAsDataURL(blob)
    })
  }

  const arrayBuffer = await blob.arrayBuffer()
  if (typeof Buffer !== 'undefined') {
    const buffer = Buffer.from(arrayBuffer)
    return `data:${blob.type || 'application/pdf'};base64,${buffer.toString('base64')}`
  }

  throw new Error('Unable to convert blob to data URL in this environment')
}

const createInvoiceObjectUrl = async (blob: Blob): Promise<{ url: string; revocable: boolean }> => {
  if (supportsObjectUrls()) {
    return { url: URL.createObjectURL(blob), revocable: typeof URL.revokeObjectURL === 'function' }
  }

  const dataUrl = await blobToDataUrl(blob)
  return { url: dataUrl, revocable: false }
}

const touchCacheEntry = (invoiceId: string, entry: PdfCacheEntry) => {
  invoicePdfCache.set(invoiceId, {
    ...entry,
    expiresAt: Date.now() + INVOICE_PDF_CACHE_TTL_MS,
  })
}

/**
 * Billing API Client
 * Provides methods for interacting with billing endpoints
 */

export interface UsageItem {
  date: string
  product?: string
  quantity?: number
  unit_price?: number
}

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
    plan_type: PlatformTierId
    included_impressions: number
    included_api_calls: number
    included_data_transfer_gb: number
  }
  items?: UsageItem[]
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
export async function getCurrentUsage(options: { signal?: AbortSignal } = {}): Promise<UsageData> {
  try {
    const response: AxiosResponse<UsageData> = await apiClient.get('/billing/usage/current', {
      signal: options.signal,
    })
    return response.data
  } catch (error) {
    throw new Error(handleApiError(error))
  }
}

/**
 * List invoices with optional filters
 */
export async function listInvoices(
  params: InvoicesQueryParams = {},
  options: { signal?: AbortSignal } = {}
): Promise<InvoicesListResponse> {
  try {
    const response: AxiosResponse<InvoicesListResponse> = await apiClient.get('/billing/invoices', {
      params: {
        limit: 20,
        ...params,
      },
      signal: options.signal,
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
    let response: AxiosResponse<Invoice>
    if (options.signal) {
      response = await apiClient.get(`/billing/invoices/${invoiceId}`, { signal: options.signal })
    } else {
      // Pass only the URL when no config is needed to keep compatibility with tests/mocks
      response = await apiClient.get(`/billing/invoices/${invoiceId}`)
    }
    return response.data
  } catch (error) {
    throw new Error(handleApiError(error))
  }
}

/**
 * Download invoice PDF
 * Returns a blob URL that can be used in an anchor tag or iframe
 */
export function clearInvoicePdfCache() {
  for (const [invoiceId, entry] of invoicePdfCache.entries()) {
    revokeEntry(entry)
    invoicePdfCache.delete(invoiceId)
  }
}

export async function downloadInvoicePDF(invoiceId: string): Promise<string> {
  try {
    pruneExpiredEntries()
    registerUnauthorizedCacheInvalidation()

    const cached = invoicePdfCache.get(invoiceId)
    const headers: Record<string, string> = {}
    if (cached?.etag) {
      headers['If-None-Match'] = cached.etag
    }

    const response = await apiClient.get(`/billing/invoices/${invoiceId}/pdf`, {
      responseType: 'blob',
      headers,
      validateStatus: (s) => [200, 304].includes(s || 0),
    })

    if (response.status === 304 && cached) {
      touchCacheEntry(invoiceId, cached)
      return cached.url
    }

    if (cached && cached.url && !supportsObjectUrls()) {
      // For data URLs we cannot differentiate stale values, so drop stale entry explicitly
      invoicePdfCache.delete(invoiceId)
    }

    const etag = String((response.headers as any)?.etag || '') || undefined
    const blob = new Blob([response.data], { type: 'application/pdf' })
    const { url, revocable } = await createInvoiceObjectUrl(blob)

    ensureCacheBudget()
    const entry: PdfCacheEntry = {
      invoiceId,
      etag,
      url,
      revocable,
      expiresAt: Date.now() + INVOICE_PDF_CACHE_TTL_MS,
    }
    invoicePdfCache.set(invoiceId, entry)
    return url
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

export async function resendInvoiceEmail(payload: { invoiceId: string; email: string }) {
  try {
    await apiClient.post('/billing/invoices/resend', payload)
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
    const axiosError = error as AxiosError
    if (axiosError?.response?.status === 404) {
      return { billingEnabled: false }
    }
    throw new Error(handleApiError(error))
  }
}
