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
  NotificationSettings,
  ComplianceSettings,
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
export const revenueApi = {
  getTimeSeries: async (params: {
    startDate: string
    endDate: string
    granularity?: 'hour' | 'day' | 'week' | 'month'
  }) => {
    if (USE_MOCK_API) return mockApiCall<RevenueData[]>('revenue-timeseries')
    return apiClient.get<RevenueData[]>('/revenue/timeseries', { params })
  },
  getSummary: async (params: { startDate: string; endDate: string }) => {
    if (USE_MOCK_API) return mockApiCall<AnalyticsSummary>('revenue-summary')
    return apiClient.get<AnalyticsSummary>('/revenue/summary', { params })
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
  getAlerts: async (publisherId: string, params?: { limit?: number }) => {
    if (USE_MOCK_API) return mockApiCall<{ alerts: FraudAlert[] }>('fraud-alerts')
    return fraudApiClient.get<{ alerts: FraudAlert[] }>(`/fraud/alerts/${publisherId}`, { params })
  },
  getStats: async (publisherId: string, params?: { window?: '1h' | '24h' | '7d' | '30d' }) => {
    if (USE_MOCK_API) return mockApiCall<FraudStats>('fraud-stats')
    return fraudApiClient.get<FraudStats>(`/fraud/stats/${publisherId}`, { params })
  },
  getDashboard: (publisherId: string) =>
    fraudApiClient.get(`/fraud/dashboard/${publisherId}`),
  getTrend: (
    publisherId: string,
    params: { start: string; end: string; granularity: 'hourly' | 'daily' | 'weekly' }
  ) => fraudApiClient.get(`/fraud/trend/${publisherId}`, { params }),
}

// Payout API
export const payoutApi = {
  getHistory: async (params?: { page?: number; pageSize?: number }) => {
    if (USE_MOCK_API) return mockApiCall<PaginatedResponse<PayoutHistory>>('payout-history')
    return apiClient.get<PaginatedResponse<PayoutHistory>>('/payouts/history', { params })
  },
  getUpcoming: async () => {
    if (USE_MOCK_API) return mockApiCall<PayoutHistory>('payout-upcoming')
    return apiClient.get<PayoutHistory>('/payouts/upcoming')
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
}
