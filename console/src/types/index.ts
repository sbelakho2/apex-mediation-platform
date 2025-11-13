// Publisher types
export interface Publisher {
  id: string
  name: string
  email: string
  status: 'active' | 'suspended' | 'pending'
  createdAt: string
  balance: number
  revenueThisMonth: number
  impressionsThisMonth: number
}

// Placement types
export interface Placement {
  id: string
  name: string
  type: 'banner' | 'interstitial' | 'rewarded'
  status: 'active' | 'paused' | 'archived'
  format: string
  platformId: string
  publisherId: string
  createdAt: string
  updatedAt: string
}

// Adapter types
export interface Adapter {
  id: string
  name: string
  network: string
  status: 'active' | 'inactive' | 'testing'
  priority: number
  ecpm: number
  fillRate: number
  requestCount: number
  impressionCount: number
  placementId: string
  createdAt: string
  updatedAt: string
}

// Revenue types
export interface RevenueData {
  date: string
  revenue: number
  impressions: number
  clicks: number
  ecpm: number
  fillRate: number
}

// Analytics types
export interface AnalyticsSummary {
  totalRevenue: number
  totalImpressions: number
  totalClicks: number
  averageEcpm: number
  averageFillRate: number
  periodStart: string
  periodEnd: string
  revenueChangePercent?: number
  impressionsChangePercent?: number
  ecpmChangePercent?: number
  fillRateChangePercent?: number
}

// Fraud types
export interface FraudAlert {
  id: string
  timestamp: string
  alertType: 'givt' | 'sivt' | 'ml_fraud' | 'anomaly'
  severity: 'low' | 'medium' | 'high' | 'critical'
  publisherId: string
  deviceId?: string
  ipAddress?: string
  fraudScore: number
  detectionType: 'rule_based' | 'ml_based' | 'anomaly'
  action: 'block' | 'flag' | 'monitor'
  metadata: Record<string, any>
}

export interface FraudStats {
  publisherId: string
  timeWindow: string
  totalRequests: number
  fraudRequests: number
  fraudRate: number
  givtDetections: number
  sivtDetections: number
  mlDetections: number
  anomalyDetections: number
  blockedRequests: number
  flaggedRequests: number
  averageFraudScore: number
  topFraudTypes: string[]
  lastUpdated: string
}

// Payment types
export interface PayoutHistory {
  id: string
  amount: number
  currency: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  method: 'stripe' | 'paypal' | 'wire'
  scheduledDate: string
  completedDate?: string
  publisherId: string
}

export interface FraudSettings {
  alertEmails: string[]
  warningThreshold: number
  blockThreshold: number
  autoBlock: boolean
  webhookUrl?: string
}

export interface PayoutSettings {
  method: 'stripe' | 'paypal' | 'wire'
  accountName: string
  accountNumberMasked: string
  currency: string
  minimumPayout: number
  autoPayout: boolean
  backupMethod?: 'stripe' | 'paypal' | 'wire'
}

// Team types
export interface TeamMember {
  id: string
  email: string
  name: string
  role: 'owner' | 'admin' | 'developer' | 'finance'
  status: 'active' | 'invited' | 'suspended'
  invitedAt?: string
  joinedAt?: string
  lastActiveAt?: string
  permissions: string[]
}

export interface TeamInvitation {
  email: string
  role: 'admin' | 'developer' | 'finance'
  permissions?: string[]
}

// Notification types
export interface NotificationSettings {
  emailAlerts: {
    enabled: boolean
    recipients: string[]
    events: string[]
  }
  slackIntegration: {
    enabled: boolean
    webhookUrl?: string
    channel?: string
    events: string[]
  }
  webhooks: {
    enabled: boolean
    endpoints: WebhookEndpoint[]
  }
  digest: {
    enabled: boolean
    frequency: 'daily' | 'weekly' | 'monthly'
    recipients: string[]
  }
}

export interface WebhookEndpoint {
  id: string
  url: string
  events: string[]
  secret: string
  active: boolean
  createdAt: string
}

// Compliance types
export interface ComplianceSettings {
  gdprEnabled: boolean
  ccpaEnabled: boolean
  coppaMode: boolean
  consentManagement: {
    provider?: 'custom' | 'onetrust' | 'cookiebot'
    autoBlock: boolean
    consentString?: string
  }
  dataRetention: {
    rawEventsDays: number
    aggregatedDataDays: number
    userDataDays: number
  }
  regionalSettings: {
    euTrafficOnly: boolean
    blockedCountries: string[]
    sensitiveCategories: string[]
  }
}

// API Response types
export interface ApiResponse<T> {
  data: T
  message?: string
  error?: string
}

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  pageSize: number
  hasMore: boolean
}

// Auth types
export interface User {
  id: string
  email: string
  name: string
  role: 'publisher' | 'admin'
  publisherId?: string
  avatar?: string
}

export interface LoginRequest {
  email: string
  password: string
}

export interface LoginResponse {
  user: User
  token: string
  expiresAt: string
}

// Migration Studio types
export type MigrationExperimentStatus = 'draft' | 'active' | 'paused' | 'completed' | 'archived'

export type MigrationMappingStatus = 'pending' | 'confirmed' | 'skipped' | 'conflict'
export type MigrationMappingConfidence = 'high' | 'medium' | 'low'
export type MigrationImportSource = 'csv' | 'ironSource' | 'applovin'
export type MigrationImportStatus = 'draft' | 'pending_review' | 'completed' | 'failed'

export interface MigrationGuardrails {
  latency_budget_ms?: number
  revenue_floor_percent?: number
  max_error_rate_percent?: number
  min_impressions?: number
}

export interface MigrationExperiment {
  id: string
  publisher_id: string
  name: string
  description?: string
  app_id?: string
  placement_id?: string
  objective: 'revenue_comparison' | 'fill_rate' | 'latency'
  seed: string
  mirror_percent: number
  mode?: 'shadow' | 'mirroring'
  status: MigrationExperimentStatus
  activated_at?: string
  paused_at?: string
  completed_at?: string
  guardrails: MigrationGuardrails | null
  last_guardrail_check?: string
  created_by?: string
  created_at: string
  updated_at: string
}

export interface MigrationMapping {
  id: string
  experiment_id: string
  incumbent_network: string
  incumbent_instance_id: string
  incumbent_instance_name?: string
  incumbent_waterfall_position?: number
  incumbent_ecpm_cents?: number
  mapping_status: MigrationMappingStatus
  mapping_confidence?: MigrationMappingConfidence
  our_adapter_id?: string
  our_adapter_name?: string
  conflict_reason?: string
  created_at: string
  updated_at: string
}

export interface MigrationImportResponse {
  import_id: string
  experiment_id?: string
  placement_id?: string
  source: MigrationImportSource
  status: MigrationImportStatus
  created_at: string
  mappings: MigrationMapping[]
  summary: MigrationImportSummary
}

export interface MigrationImportSummary {
  total_mappings: number
  status_breakdown: Record<MigrationMappingStatus, number>
  confidence_breakdown: Record<MigrationMappingConfidence, number>
  unique_networks: number
}

export interface MigrationMappingUpdateResponse {
  mapping: MigrationMapping
  summary: MigrationImportSummary
}

export interface EvaluateGuardrailsResponse {
  shouldPause: boolean
  violations: string[]
}
