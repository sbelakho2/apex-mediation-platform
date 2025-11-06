// Web SDK (MVP) — feature-complete enough for local/dev use and competitive baseline tests
// - Unified API: initialize, setConsent, on/off, loadInterstitial (returns bid summary), showInterstitial (stub)
// - Network calls are OFF unless an explicit auctionUrl is provided in initialize() to respect offline/dev setup
// - Supports test_endpoint passthrough via request metadata for adapter offline conformance

export type InitializationOptions = {
  apiKey: string;
  publisherId: string;
  auctionUrl?: string; // e.g., http://localhost:8081
  defaultTimeoutMs?: number; // default: 800ms
};

export type Consent = {
  gdprApplies?: boolean;
  consentString?: string; // TCF v2
  ccpaUspString?: string; // CCPA/US Privacy
  coppa?: boolean;
  limitAdTracking?: boolean;
};

export type InterstitialOptions = {
  placementId: string;
  floorCpm?: number;
  adapters?: string[]; // override default adapter set
  metadata?: Record<string, string>; // e.g., { test_endpoint: "http://127.0.0.1:1234" }
  timeoutMs?: number; // override default
};

export type InterstitialResult = {
  adapter: string;
  ecpm: number;
  currency: string;
  creativeId?: string;
  adMarkup?: string;
  raw?: any;
};

// Simple event emitter
export type EventHandler = (...args: unknown[]) => void;

class ApexMediationWebSDK {
  private initialized = false;
  private handlers: Record<string, EventHandler[]> = {};
  private auctionUrl: string | undefined;
  private publisherId: string | undefined;
  private apiKey: string | undefined;
  private defaultTimeoutMs = 800;
  private consent: Consent | undefined;

  initialize(options: InitializationOptions): void {
    if (!options?.apiKey || !options?.publisherId) {
      throw new Error('Invalid initialization options');
    }
    this.apiKey = options.apiKey;
    this.publisherId = options.publisherId;
    this.auctionUrl = options.auctionUrl;
    this.defaultTimeoutMs = Math.max(100, options.defaultTimeoutMs ?? 800);
    this.initialized = true;
    this.emit('ready');
  }

  setConsent(consent: Consent) {
    this.consent = consent || {};
  }

  on(event: string, handler: EventHandler): void {
    if (!this.handlers[event]) {
      this.handlers[event] = [];
    }
    this.handlers[event].push(handler);
  }

  off(event: string, handler: EventHandler): void {
    const arr = this.handlers[event];
    if (!arr) return;
    this.handlers[event] = arr.filter((h) => h !== handler);
  }

  async loadInterstitial(options: InterstitialOptions): Promise<InterstitialResult> {
    if (!this.initialized) throw new Error('SDK not initialized');
    if (!options?.placementId) throw new Error('Invalid placementId');

    // If no auctionUrl configured, return a deterministic, offline stub for demos/tests
    if (!this.auctionUrl) {
      const stub = { adapter: 'stub', ecpm: 1.23, currency: 'USD', creativeId: 'stub', adMarkup: '<div>ad</div>' };
      this.emit('interstitial_loaded', stub);
      return stub;
    }

    const request = this.buildBidRequest(options);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? this.defaultTimeoutMs);

    try {
      const res = await fetch(`${this.auctionUrl}/v1/auction`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key': this.apiKey || '',
        },
        body: JSON.stringify(request),
        signal: controller.signal,
      });
      const body = await res.json();
      if (!res.ok) {
        // Prefer standardized taxonomy using HTTP status
        const reason = `status_${res.status}`;
        this.emit('interstitial_error', reason);
        // Preserve server error text in the thrown message for debugging, but do not change the reason mapping
        const detail = body && body.error ? `: ${String(body.error)}` : '';
        throw new Error(reason + detail);
      }
      const winner = body?.winner || null;
      if (!winner) {
        this.emit('interstitial_no_fill', 'no_fill');
        throw new Error('no_fill');
      }
      const result: InterstitialResult = {
        adapter: winner.adapter_name || winner.AdapterName || 'unknown',
        ecpm: winner.cpm || winner.CPM || 0,
        currency: winner.currency || winner.Currency || 'USD',
        creativeId: winner.creative_id || winner.CreativeID,
        adMarkup: winner.ad_markup || winner.AdMarkup,
        raw: body,
      };
      this.emit('interstitial_loaded', result);
      return result;
    } catch (err: any) {
      const msg = err?.name === 'AbortError' ? 'timeout' : err?.message || 'error';
      // Map to normalized reasons
      const reason = msg === 'timeout' ? 'timeout' : (msg?.startsWith('status_') ? msg : 'error');
      this.emit('interstitial_error', reason);
      throw new Error(reason);
    } finally {
      clearTimeout(timeout);
    }
  }

  // For parity, simple alias; in the MVP we only return data and let host render/manage UI.
  async requestInterstitial(options: InterstitialOptions): Promise<InterstitialResult> {
    return this.loadInterstitial(options);
  }

  // Stubbed show method to ease future rendering integration.
  async showInterstitial(_container?: HTMLElement): Promise<void> {
    // In a full implementation, render adMarkup into an iframe container, manage clicks/close, and emit lifecycle events.
    // For MVP, we only emit a shown event to allow host apps to measure basic flow.
    this.emit('interstitial_shown');
  }

  private emit(event: string, ...args: unknown[]): void {
    const listeners = this.handlers[event] || [];
    listeners.forEach((handler) => handler(...args));
  }

  private buildBidRequest(options: InterstitialOptions) {
    const now = Date.now();
    const reqId = `web-${now}-${Math.floor(Math.random()*1e6)}`;
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown';
    const lang = typeof navigator !== 'undefined' ? navigator.language : 'en';
    const screenW = typeof window !== 'undefined' ? window.screen.width : 0;
    const screenH = typeof window !== 'undefined' ? window.screen.height : 0;

    const deviceInfo = {
      os: 'web',
      os_version: '',
      make: '',
      model: '',
      screen_width: screenW,
      screen_height: screenH,
      language: lang,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
      connection_type: 'unknown',
      ip: '', // never send raw IP from client; server derives
      user_agent: ua,
    };

    const userInfo = {
      advertising_id: '', // web typically lacks a stable ID
      limit_ad_tracking: !!this.consent?.limitAdTracking,
      consent_string: this.consent?.consentString || '',
    };

    const metadata = { ...(options.metadata || {}) };

    return {
      request_id: reqId,
      app_id: this.publisherId,
      placement_id: options.placementId,
      ad_type: 'interstitial',
      device_info: deviceInfo,
      user_info: userInfo,
      floor_cpm: options.floorCpm ?? 0,
      timeout_ms: options.timeoutMs ?? this.defaultTimeoutMs,
      auction_type: 'header_bidding',
      adapters: options.adapters && options.adapters.length > 0 ? options.adapters : ['admob','meta','unity','applovin','ironsource'],
      metadata,
    };
  }
}

export const ApexMediation = new ApexMediationWebSDK();
