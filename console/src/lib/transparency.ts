import { apiClient } from './api-client'

export type TransparencyAuction = {
  auction_id: string
  timestamp: string
  publisher_id: string
  app_or_site_id: string
  placement_id: string
  surface_type: 'mobile_app' | 'web' | 'ctv'
  device_context: {
    os: string
    geo: string
    att: string
    tc_string_sha256: string
  }
  candidates: Array<{
    source: string
    bid_ecpm: number
    currency: string
    response_time_ms: number
    status: string
    metadata_hash: string
  }>
  winner: {
    source: string
    bid_ecpm: number
    gross_price: number
    currency: string
    reason: string
  }
  fees: {
    aletheia_fee_bp: number
    effective_publisher_share: number
  }
  integrity: {
    signature: string
    algo: string
    key_id: string
  }
}

export type VerifyResult = {
  status: 'pass' | 'fail' | 'not_applicable' | 'unknown_key'
  key_id?: string | null
  algo?: string | null
  reason?: string
  canonical?: string
  sample_bps?: number
}

export const transparencyApi = {
  async list(params: {
    page?: number
    limit?: number
    from?: string
    to?: string
    placement_id?: string
    surface?: string
    geo?: string
    publisher_id?: string
  }, options: { signal?: AbortSignal } = {}) {
    const res = await apiClient.get<{ page: number; limit: number; count: number; data: TransparencyAuction[] }>(
      '/transparency/auctions',
      { params, signal: options.signal }
    )
    return res.data
  },

  async get(auctionId: string) {
    const res = await apiClient.get<TransparencyAuction>(`/transparency/auctions/${auctionId}`)
    return res.data
  },

  async verify(auctionId: string) {
    const res = await apiClient.get<VerifyResult>(`/transparency/auctions/${auctionId}/verify`)
    return res.data
  },

  async keys() {
    const res = await apiClient.get<{ count: number; data: Array<{ key_id: string; algo: string; public_key_base64: string; active: number }> }>(
      '/transparency/keys'
    )
    return res.data
  },
}
