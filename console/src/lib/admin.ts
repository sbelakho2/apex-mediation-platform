"use client"

import { apiClient, handleApiError } from './api-client'

export interface AuditEntry {
  id: string
  organization_id: string
  event_type: string
  metadata: any
  created_at: string
}

export interface AuditListResponse {
  success: boolean
  data: AuditEntry[]
  pagination: { page: number; limit: number; total: number; total_pages: number }
}

export async function listBillingAudit(params?: {
  page?: number
  limit?: number
  org_id?: string
  action?: string
  from?: string
  to?: string
}): Promise<AuditListResponse> {
  try {
    const res = await apiClient.get('/admin/billing/audit', { params })
    return res.data as AuditListResponse
  } catch (err) {
    throw new Error(handleApiError(err))
  }
}
