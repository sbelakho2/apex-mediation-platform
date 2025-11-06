/**
 * Auction service API client (Go service)
 * Separate from Node backend API to avoid proxying for read-only admin endpoints.
 */

const AUCTION_URL = process.env.NEXT_PUBLIC_AUCTION_URL || 'http://localhost:8081';

export interface ApiEnvelope<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

async function request<T = any>(endpoint: string, options: RequestInit = {}): Promise<ApiEnvelope<T>> {
  const url = `${AUCTION_URL}${endpoint}`;
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };
  try {
    const res = await fetch(url, { ...options, headers, cache: 'no-store' });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { success: false, error: body.error || `Request failed (${res.status})` };
    }
    return { success: true, data: (body.data ?? body) };
  } catch (e: any) {
    return { success: false, error: e?.message || 'Network error' };
  }
}

export const auctionApi = {
  getAdapterMetrics: () => request('/v1/metrics/adapters'),
  getAdapterMetricsTimeSeries: (days = 7) => {
    const d = Math.max(1, Math.min(14, days));
    return request(`/v1/metrics/adapters/timeseries?days=${d}`);
  },
  getAdapterSLO: () => request('/v1/metrics/slo'),
  getMediationDebugEvents: (placementId = '', n = 50) => {
    const params = new URLSearchParams();
    if (placementId) params.set('placement_id', placementId);
    if (n) params.set('n', String(n));
    const qs = params.toString();
    return request(`/v1/debug/mediation${qs ? `?${qs}` : ''}`);
  },
};
