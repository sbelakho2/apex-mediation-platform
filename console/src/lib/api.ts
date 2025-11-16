import { apiClient, fraudApiClient, analyticsApiClient } from './api-client'
import type {
  Publisher,
  Placement,
  Adapter,
  RevenueData,
  AnalyticsSummary,
  FraudAlert,
  FraudStats,
  PayoutHistory,
  PaginatedResponse,
  FraudSettings,
  PayoutSettings,
  TeamMember,
  TeamInvitation,
  TeamRoleDefinition,
  NotificationSettings,
  ComplianceSettings,
  ApiResponse,
  MigrationExperiment,
  MigrationImportResponse,
  MigrationImportSource,
  MigrationMapping,
  MigrationMappingUpdateResponse,
  MigrationGuardrails,
  EvaluateGuardrailsResponse,
  MigrationExperimentReport,
  MigrationExperimentShareLink,
} from '@/types'

const USE_MOCK_API = process.env.NEXT_PUBLIC_USE_MOCK_API === 'true'

// Helper to create mock API calls
const mockApiCall = async <T>(endpoint: string): Promise<{ data: T }> => {
  if (USE_MOCK_API) {
    const response = await fetch(`/api/mock?endpoint=${endpoint}`)
    if (!response.ok) throw new Error('Mock API error')
    const data = await response.json()
    return { data }
  }
  throw new Error('Mock API not enabled')
}

// Publisher API
export const publisherApi = {
  getCurrent: () => apiClient.get<Publisher>('/publishers/me'),
  update: (data: Partial<Publisher>) => apiClient.put<Publisher>('/publishers/me', data),
}

// Placement API
export const placementApi = {
  list: async (params?: { page?: number; pageSize?: number }) => {
    if (USE_MOCK_API) return mockApiCall<PaginatedResponse<Placement>>('placements')
    return apiClient.get<PaginatedResponse<Placement>>('/placements', { params })
  },
  get: (id: string) => apiClient.get<Placement>(`/placements/${id}`),
  create: (data: Partial<Placement>) => apiClient.post<Placement>('/placements', data),
  update: (id: string, data: Partial<Placement>) =>
    apiClient.put<Placement>(`/placements/${id}`, data),
  delete: (id: string) => apiClient.delete(`/placements/${id}`),
  getFormatCatalog: () => {
    if (USE_MOCK_API) return mockApiCall<Record<string, string[]>>('placement-formats')
    return apiClient.get<Record<string, string[]>>('/placements/formats')
  },
}

// Adapter API
export const adapterApi = {
  list: async (placementId?: string) => {
    if (USE_MOCK_API) return mockApiCall<Adapter[]>('adapters')
    return apiClient.get<Adapter[]>('/adapters', {
      params: placementId ? { placement_id: placementId } : undefined,
    })
  },
  get: (id: string) => apiClient.get<Adapter>(`/adapters/${id}`),
  update: (id: string, data: Partial<Adapter>) =>
    apiClient.put<Adapter>(`/adapters/${id}`, data),
  create: (data: Partial<Adapter>) => apiClient.post<Adapter>('/adapters', data),
  delete: (id: string) => apiClient.delete(`/adapters/${id}`),
}

// Revenue API
type RevenueTimeSeriesRequest = {
  startDate: string
  endDate: string
  granularity?: 'hour' | 'day' | 'week' | 'month'
  signal?: AbortSignal
}

type RevenueSummaryRequest = {
  startDate: string
  endDate: string
  signal?: AbortSignal
}

export const revenueApi = {
  getTimeSeries: async ({ signal, ...params }: RevenueTimeSeriesRequest) => {
    if (USE_MOCK_API) return mockApiCall<RevenueData[]>('revenue-timeseries')
    return apiClient.get<RevenueData[]>('/revenue/timeseries', {
      params,
      signal,
    })
  },
  getSummary: async ({ signal, ...params }: RevenueSummaryRequest) => {
    if (USE_MOCK_API) return mockApiCall<AnalyticsSummary>('revenue-summary')
    return apiClient.get<AnalyticsSummary>('/revenue/summary', {
      params,
      signal,
    })
  },
}

// Analytics API
export const analyticsApi = {
  getImpressions: async (params: {
    startDate: string
    endDate: string
    groupBy?: 'placement' | 'adapter' | 'date'
  }) => {
    if (USE_MOCK_API) return mockApiCall('analytics')
    return analyticsApiClient.get('/analytics/impressions', { params })
  },
  getPerformance: (placementId: string, params: { startDate: string; endDate: string }) =>
    analyticsApiClient.get(`/analytics/performance/${placementId}`, { params }),
}

// Fraud API
export const fraudApi = {
  getAlerts: async (
    publisherId: string,
    params?: { limit?: number; signal?: AbortSignal }
  ) => {
    if (USE_MOCK_API) return mockApiCall<{ alerts: FraudAlert[] }>('fraud-alerts')
    const { signal, ...query } = params ?? {}
    return fraudApiClient.get<{ alerts: FraudAlert[] }>(`/fraud/alerts/${publisherId}`, {
      params: query,
      signal,
    })
  },
  getStats: async (
    publisherId: string,
    params?: { window?: '1h' | '24h' | '7d' | '30d'; signal?: AbortSignal }
  ) => {
    if (USE_MOCK_API) return mockApiCall<FraudStats>('fraud-stats')
    const { signal, ...query } = params ?? {}
    return fraudApiClient.get<FraudStats>(`/fraud/stats/${publisherId}`, {
      params: query,
      signal,
    })
  },
  getDashboard: (publisherId: string) =>
    fraudApiClient.get(`/fraud/dashboard/${publisherId}`),
  getTrend: (
    publisherId: string,
    params: { start: string; end: string; granularity: 'hourly' | 'daily' | 'weekly' }
  ) => fraudApiClient.get(`/fraud/trend/${publisherId}`, { params }),
}

// Migration Studio API
type CreateMigrationImportParams = {
  placementId: string
  source: MigrationImportSource
  experimentId?: string
  file?: File
  credentials?: Record<string, string>
}

type UpdateMigrationExperimentParams = {
  name?: string
  description?: string
  mirror_percent?: number
  guardrails?: Partial<MigrationGuardrails>
}

type ActivateMigrationExperimentParams = {
  mirror_percent: number
}

type UpdateMigrationMappingParams = {
  mappingId: string
  ourAdapterId: string
  notes?: string
}

type GetMigrationExperimentReportParams = {
  window?: string
  start?: string
  end?: string
  granularity?: 'hour' | 'day'
  timezone?: string
}

type CreateMigrationExperimentShareLinkParams = {
  expires_in_hours: number
}

export const migrationApi = {
  listExperiments: async (params?: { placementId?: string; status?: string }) => {
    const query = params
      ? {
          status: params.status,
          placement_id: params.placementId,
        }
      : undefined
    if (USE_MOCK_API) {
      return mockApiCall<ApiResponse<MigrationExperiment[]>>('migration-experiments')
    }
    return apiClient.get<ApiResponse<MigrationExperiment[]>>('/migration/experiments', {
      params: query,
    })
  },
  getExperiment: async (id: string) => {
    if (USE_MOCK_API) {
      const response = await mockApiCall<ApiResponse<MigrationExperiment>>('migration-experiment')
      return response.data.data
    }
    const response = await apiClient.get<ApiResponse<MigrationExperiment>>(`/migration/experiments/${id}`)
    return response.data.data
  },
  getExperimentReport: async (id: string, params?: GetMigrationExperimentReportParams) => {
    if (USE_MOCK_API) {
      const now = new Date()
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
      const days = Array.from({ length: 7 }).map((_, index) => {
        const offset = 6 - index
        const date = new Date(now.getTime() - offset * 24 * 60 * 60 * 1000)
        date.setHours(0, 0, 0, 0)
        return date
      })

      const buildCurrencySeries = (baseControl: number, baseTest: number) =>
        days.map((date, idx) => {
          const modifier = 1 + Math.sin(idx / 2.5) * 0.05
          return {
            timestamp: date.toISOString(),
            control: Math.round(baseControl * modifier),
            test: Math.round(baseTest * modifier * 1.06),
          }
        })

      const buildPercentSeries = (baseControl: number, baseTest: number) =>
        days.map((date, idx) => {
          const modifier = Math.cos(idx / 3) * 1.5
          return {
            timestamp: date.toISOString(),
            control: Number((baseControl + modifier).toFixed(1)),
            test: Number((baseTest + modifier + 0.8).toFixed(1)),
          }
        })

      const buildMillisecondsSeries = (baseControl: number, baseTest: number) =>
        days.map((date, idx) => {
          const modifier = Math.sin(idx / 2) * 12
          return {
            timestamp: date.toISOString(),
            control: Math.round(baseControl + modifier),
            test: Math.round(baseTest + modifier - 18),
          }
        })

      return {
        experiment_id: id,
        generated_at: now.toISOString(),
        window: {
          start: sevenDaysAgo.toISOString(),
          end: now.toISOString(),
          timezone: 'UTC',
        },
        metrics: {
          overall: [
            {
              id: 'revenue',
              label: 'Net revenue',
              unit: 'currency_cents',
              control: 125_000,
              test: 138_000,
              uplift: 10.4,
              sample_size: { control: 120000, test: 118500 },
            },
            {
              id: 'ecpm',
              label: 'eCPM',
              unit: 'currency_cents',
              control: 235,
              test: 252,
              uplift: 7.2,
            },
            {
              id: 'fill',
              label: 'Fill rate',
              unit: 'percent',
              control: 87.4,
              test: 90.9,
              uplift: 4.0,
            },
            {
              id: 'latency_p95',
              label: 'Latency p95',
              unit: 'milliseconds',
              control: 430,
              test: 405,
              uplift: 5.8,
            },
            {
              id: 'ivt',
              label: 'IVT rate',
              unit: 'percent',
              control: 1.8,
              test: 1.5,
              uplift: 16.7,
            },
          ],
          timeseries: [
            {
              id: 'revenue',
              label: 'Net revenue',
              unit: 'currency_cents',
              points: buildCurrencySeries(17_500, 19_200),
            },
            {
              id: 'ecpm',
              label: 'eCPM',
              unit: 'currency_cents',
              points: buildCurrencySeries(220, 236),
            },
            {
              id: 'fill',
              label: 'Fill rate',
              unit: 'percent',
              points: buildPercentSeries(86.2, 88.5),
            },
            {
              id: 'latency_p95',
              label: 'Latency p95',
              unit: 'milliseconds',
              points: buildMillisecondsSeries(440, 418),
            },
            {
              id: 'ivt',
              label: 'IVT rate',
              unit: 'percent',
              points: buildPercentSeries(1.9, 1.5),
            },
          ],
        },
      } satisfies MigrationExperimentReport
    }
    const response = await apiClient.get<ApiResponse<MigrationExperimentReport>>(
      `/migration/experiments/${id}/report`,
      { params }
    )
    return response.data.data
  },
  getExperimentShareLinks: async (id: string) => {
    if (USE_MOCK_API) {
      const now = new Date()
      const expires = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
      return [
        {
          id: 'mock-share-link',
          url: `https://console.example.dev/migration-reports/${id}/mock-share-link`,
          created_at: now.toISOString(),
          expires_at: expires.toISOString(),
        },
      ] satisfies MigrationExperimentShareLink[]
    }
    const response = await apiClient.get<ApiResponse<MigrationExperimentShareLink[]>>(
      `/migration/experiments/${id}/share-links`
    )
    return response.data.data
  },
  createExperimentShareLink: async (
    id: string,
    params: CreateMigrationExperimentShareLinkParams
  ) => {
    if (USE_MOCK_API) {
      const now = new Date()
      const expires = new Date(now.getTime() + params.expires_in_hours * 60 * 60 * 1000)
      return {
        id: `mock-share-link-${params.expires_in_hours}`,
        url: `https://console.example.dev/migration-reports/${id}/mock-share-link`,
        created_at: now.toISOString(),
        expires_at: expires.toISOString(),
      } satisfies MigrationExperimentShareLink
    }
    const response = await apiClient.post<ApiResponse<MigrationExperimentShareLink>>(
      `/migration/experiments/${id}/share-links`,
      params
    )
    return response.data.data
  },
  revokeExperimentShareLink: async (id: string, shareLinkId: string) => {
    if (USE_MOCK_API) {
      return
    }
    await apiClient.delete<ApiResponse<null>>(
      `/migration/experiments/${id}/share-links/${shareLinkId}`
    )
  },
  downloadExperimentReport: async (id: string) => {
    if (USE_MOCK_API) {
      const mockArtifact = {
        experiment_id: id,
        generated_at: new Date().toISOString(),
        signature: 'mock-signature',
      }
      return new Blob([JSON.stringify(mockArtifact, null, 2)], {
        type: 'application/json',
      })
    }
    const response = await apiClient.get(`/migration/experiments/${id}/report/artifact`, {
      responseType: 'blob',
    })
    return response.data as Blob
  },
  createImport: async (params: CreateMigrationImportParams) => {
    if (USE_MOCK_API) {
      const response = await mockApiCall<MigrationImportResponse>('migration-import')
      return response.data
    }

    if (params.source === 'csv') {
      const formData = new FormData()
      formData.append('source', params.source)
      formData.append('placement_id', params.placementId)
      if (params.experimentId) formData.append('experiment_id', params.experimentId)
      if (params.file) formData.append('file', params.file)
      const response = await apiClient.post<ApiResponse<MigrationImportResponse>>('/migration/import', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      return response.data.data
    }

    const response = await apiClient.post<ApiResponse<MigrationImportResponse>>('/migration/import', {
      source: params.source,
      placement_id: params.placementId,
      experiment_id: params.experimentId,
      credentials: params.credentials ?? {},
    })
    return response.data.data
  },
  updateMapping: async ({ mappingId, ourAdapterId, notes }: UpdateMigrationMappingParams) => {
    if (USE_MOCK_API) {
      const response = await mockApiCall<MigrationMapping>('migration-mapping')
      return { mapping: response.data, summary: { total_mappings: 1, status_breakdown: { pending: 0, confirmed: 1, skipped: 0, conflict: 0 }, confidence_breakdown: { high: 0, medium: 1, low: 0 }, unique_networks: 1 } }
    }
    const response = await apiClient.put<ApiResponse<MigrationMappingUpdateResponse>>(`/migration/mappings/${mappingId}`, {
      our_adapter_id: ourAdapterId,
      notes,
    })
    return response.data.data
  },
  finalizeImport: async (importId: string) => {
    if (USE_MOCK_API) {
      const response = await mockApiCall<MigrationImportResponse>('migration-import')
      return response.data
    }
    const response = await apiClient.post<ApiResponse<MigrationImportResponse>>(
      `/migration/import/${importId}/finalize`,
      {}
    )
    return response.data.data
  },
  updateExperiment: async (id: string, params: UpdateMigrationExperimentParams) => {
    if (USE_MOCK_API) {
      const response = await mockApiCall<ApiResponse<MigrationExperiment>>('migration-experiment')
      return response.data.data
    }
    const response = await apiClient.put<ApiResponse<MigrationExperiment>>(
      `/migration/experiments/${id}`,
      params
    )
    return response.data.data
  },
  activateExperiment: async (id: string, params: ActivateMigrationExperimentParams) => {
    if (USE_MOCK_API) {
      const response = await mockApiCall<ApiResponse<MigrationExperiment>>('migration-experiment')
      return response.data.data
    }
    const response = await apiClient.post<ApiResponse<MigrationExperiment>>(
      `/migration/experiments/${id}/activate`,
      params
    )
    return response.data.data
  },
  pauseExperiment: async (id: string, reason?: string) => {
    if (USE_MOCK_API) {
      const response = await mockApiCall<ApiResponse<MigrationExperiment>>('migration-experiment')
      return response.data.data
    }
    const response = await apiClient.post<ApiResponse<MigrationExperiment>>(
      `/migration/experiments/${id}/pause`,
      { reason }
    )
    return response.data.data
  },
  evaluateGuardrails: async (id: string) => {
    if (USE_MOCK_API) {
      return { shouldPause: false, violations: [] } as EvaluateGuardrailsResponse
    }
    const response = await apiClient.post<ApiResponse<EvaluateGuardrailsResponse>>(
      `/migration/experiments/${id}/guardrails/evaluate`,
      {}
    )
    return response.data.data
  },
}

// Payout API
type PayoutHistoryRequest = {
  page?: number
  pageSize?: number
  publisherId?: string
  signal?: AbortSignal
}

type UpcomingPayoutRequest = {
  publisherId?: string
  signal?: AbortSignal
}

export const payoutApi = {
  getHistory: async (params: PayoutHistoryRequest = {}) => {
    if (USE_MOCK_API) return mockApiCall<PaginatedResponse<PayoutHistory>>('payout-history')
    const { signal, ...query } = params
    return apiClient.get<PaginatedResponse<PayoutHistory>>('/payouts/history', {
      params: query,
      signal,
    })
  },
  getUpcoming: async (params: UpcomingPayoutRequest = {}) => {
    if (USE_MOCK_API) return mockApiCall<PayoutHistory>('payout-upcoming')
    const { signal, ...query } = params
    return apiClient.get<PayoutHistory>('/payouts/upcoming', {
      params: query,
      signal,
    })
  },
  updateMethod: (method: 'stripe' | 'paypal' | 'wire', details: Record<string, any>) =>
    apiClient.put('/payouts/method', { method, details }),
}

// Settings API
export const settingsApi = {
  getFraudSettings: () => apiClient.get<FraudSettings>('/settings/fraud'),
  updateFraudSettings: (data: FraudSettings) => apiClient.put('/settings/fraud', data),
  getPayoutSettings: () => apiClient.get<PayoutSettings>('/settings/payout'),
  updatePayoutSettings: (data: Partial<PayoutSettings>) =>
    apiClient.put<PayoutSettings>('/settings/payout', data),
  getNotificationSettings: () => apiClient.get<NotificationSettings>('/settings/notifications'),
  updateNotificationSettings: (data: Partial<NotificationSettings>) =>
    apiClient.put<NotificationSettings>('/settings/notifications', data),
  getComplianceSettings: () => apiClient.get<ComplianceSettings>('/settings/compliance'),
  updateComplianceSettings: (data: Partial<ComplianceSettings>) =>
    apiClient.put<ComplianceSettings>('/settings/compliance', data),
}

// Team API
export const teamApi = {
  listMembers: () => apiClient.get<TeamMember[]>('/team/members'),
  inviteMember: (invitation: TeamInvitation) =>
    apiClient.post<TeamMember>('/team/invite', invitation),
  updateMember: (id: string, data: Partial<TeamMember>) =>
    apiClient.put<TeamMember>(`/team/members/${id}`, data),
  removeMember: (id: string) => apiClient.delete(`/team/members/${id}`),
  resendInvite: (id: string) => apiClient.post(`/team/members/${id}/resend`),
  listRoles: () => apiClient.get<TeamRoleDefinition[]>('/team/roles'),
}
