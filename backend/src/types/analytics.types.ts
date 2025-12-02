/**
 * Analytics Event Types
 * 
 * Type definitions for ad events tracked in Postgres analytics fact tables
 */

export enum AdFormat {
  BANNER = 'banner',
  INTERSTITIAL = 'interstitial',
  REWARDED = 'rewarded',
  NATIVE = 'native',
}

export enum DeviceType {
  PHONE = 'phone',
  TABLET = 'tablet',
  TV = 'tv',
}

export enum OS {
  IOS = 'ios',
  ANDROID = 'android',
}

export enum RevenueType {
  IMPRESSION = 'impression',
  CLICK = 'click',
  INSTALL = 'install',
  IAP = 'iap',
}

export enum ReconciliationStatus {
  PENDING = 'pending',
  MATCHED = 'matched',
  DISCREPANCY = 'discrepancy',
}

export interface ImpressionEvent {
  eventId: string;
  timestamp: Date;
  publisherId: string;
  appId: string;
  placementId: string;
  adapterId: string;
  adapterName: string;
  adUnitId: string;
  adFormat: AdFormat;
  countryCode: string;
  deviceType: DeviceType;
  os: OS;
  osVersion: string;
  appVersion: string;
  sdkVersion: string;
  sessionId: string;
  userId: string;
  requestId: string;
  bidPriceUsd: number;
  ecpmUsd: number;
  latencyMs: number;
  isTestMode: boolean;
}

export interface ClickEvent {
  eventId: string;
  timestamp: Date;
  impressionId: string;
  publisherId: string;
  appId: string;
  placementId: string;
  adapterId: string;
  adapterName: string;
  clickUrl: string;
  countryCode: string;
  deviceType: DeviceType;
  os: OS;
  sessionId: string;
  userId: string;
  requestId: string;
  timeToClickMs: number;
  isVerified: boolean;
  isTestMode: boolean;
}

export interface RevenueEvent {
  eventId: string;
  timestamp: Date;
  publisherId: string;
  appId: string;
  placementId: string;
  adapterId: string;
  adapterName: string;
  impressionId: string;
  revenueType: RevenueType;
  revenueUsd: number;
  revenueCurrency: string;
  revenueOriginal: number;
  exchangeRate: number;
  ecpmUsd: number;
  countryCode: string;
  adFormat: AdFormat;
  os: OS;
  isTestMode: boolean;
  reconciliationStatus: ReconciliationStatus;
}

export interface PerformanceMetric {
  timestamp: Date;
  publisherId: string;
  adapterId: string;
  metricType: 'latency' | 'timeout' | 'error' | 'fill_rate';
  metricValue: number;
  requestId: string;
  errorCode?: string;
  errorMessage?: string;
}

// DTO types for API requests
export interface ImpressionEventDTO {
  event_id: string;
  timestamp: string;
  publisher_id: string;
  app_id: string;
  placement_id: string;
  adapter_id: string;
  adapter_name: string;
  ad_unit_id: string;
  ad_format: string;
  country_code: string;
  device_type: string;
  os: string;
  os_version: string;
  app_version: string;
  sdk_version: string;
  session_id: string;
  user_id: string;
  request_id: string;
  bid_price_usd: number;
  ecpm_usd: number;
  latency_ms: number;
  is_test_mode: boolean;
}

export interface ClickEventDTO {
  event_id: string;
  timestamp: string;
  impression_id: string;
  publisher_id: string;
  app_id: string;
  placement_id: string;
  adapter_id: string;
  adapter_name: string;
  click_url: string;
  country_code: string;
  device_type: string;
  os: string;
  session_id: string;
  user_id: string;
  request_id: string;
  time_to_click_ms: number;
  is_verified: boolean;
  is_test_mode: boolean;
}

export interface RevenueEventDTO {
  event_id: string;
  timestamp: string;
  publisher_id: string;
  app_id: string;
  placement_id: string;
  adapter_id: string;
  adapter_name: string;
  impression_id: string;
  revenue_type: string;
  revenue_usd: number;
  revenue_currency: string;
  revenue_original: number;
  exchange_rate: number;
  ecpm_usd: number;
  country_code: string;
  ad_format: string;
  os: string;
  is_test_mode: boolean;
  reconciliation_status: string;
}
