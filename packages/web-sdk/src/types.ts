export type ConsentState = {
  gdprApplies?: boolean;
  tcfConsent?: string | null; // IAB TCF v2 string
  usPrivacy?: string | null; // CCPA/USP string
  gpp?: string | null; // IAB GPP string
  coppa?: boolean;
};

export type InitOptions = {
  endpoint: string; // e.g., https://api.example.com
  publisherId?: string;
  appId?: string;
  timeoutMs?: number; // default 2000ms
  sdkVersion?: string;
  debug?: boolean; // enable verbose SDK logs (no PII)
  telemetryEnabled?: boolean; // allow emitting lightweight telemetry events
};

export type AdRequest = {
  placement: string;
  adType: 'banner' | 'interstitial' | 'rewarded';
  width?: number;
  height?: number;
  testMode?: boolean;
  extras?: Record<string, unknown>;
};

export type AdCreative = {
  id: string;
  html?: string; // for banner/web content
  vastTagUrl?: string; // for video
  tracking?: Record<string, string>;
};

export type AdResponse = {
  requestId: string;
  fill: boolean;
  price?: number;
  currency?: string;
  creative?: AdCreative | null;
  ttlSeconds?: number;
};

export type SdkEvent =
  | 'consent:updated'
  | 'ad:requested'
  | 'ad:filled'
  | 'ad:error';
