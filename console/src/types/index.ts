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
