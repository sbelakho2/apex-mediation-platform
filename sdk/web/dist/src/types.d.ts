export type ConsentState = {
    gdprApplies?: boolean;
    tcfConsent?: string | null;
    usPrivacy?: string | null;
    gpp?: string | null;
    coppa?: boolean;
};
export type InitOptions = {
    endpoint: string;
    publisherId?: string;
    appId?: string;
    timeoutMs?: number;
    maxRetries?: number;
    retryBackoffBaseMs?: number;
    retryJitterMs?: number;
    sdkVersion?: string;
    debug?: boolean;
    telemetryEnabled?: boolean;
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
    html?: string;
    vastTagUrl?: string;
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
export type SdkEvent = 'consent:updated' | 'ad:requested' | 'ad:filled' | 'ad:error';
