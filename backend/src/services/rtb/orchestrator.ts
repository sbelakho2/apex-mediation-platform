import crypto from 'crypto';
import { registerDefaultAdapters, getAdaptersForFormat } from './adapterRegistry';
import { AdapterBidRequest, AdapterDefinition } from './adapters/types';
import { auctionLatencySeconds, rtbErrorsTotal, rtbNoFillTotal, rtbWinsTotal } from '../../utils/prometheus';
import { signToken } from '../../utils/signing';

const envInt = (key: string, dflt: number) => {
  const v = parseInt(process.env[key] || '', 10);
  return Number.isFinite(v) ? v : dflt;
};

const AUCTION_TTL_MS = envInt('AUCTION_TTL_MS', 120);
const DELIVERY_TOKEN_TTL_SEC = envInt('DELIVERY_TOKEN_TTL_SEC', 300);
const TRACK_TOKEN_TTL_SEC = envInt('TRACK_TOKEN_TTL_SEC', 600);

export interface AuctionInput extends AdapterBidRequest {}

export interface AuctionOutput {
  success: boolean;
  response?: {
    requestId: string;
    bidId: string;
    adapter: string;
    cpm: number;
    currency: 'USD';
    ttlSeconds: number;
    creativeUrl: string; // contains signed delivery token
    tracking: { impression: string; click: string };
    payload: Record<string, unknown>;
    consentEcho?: Record<string, unknown>;
  };
  reason?: string;
}

const makeAbortError = () => { const e: any = new Error('Aborted'); e.name = 'AbortError'; return e; };
function withTimeout<T>(p: Promise<T>, ms: number, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const to = setTimeout(() => {
      (signal as any)._timeoutFired = true;
      reject(makeAbortError());
    }, ms);
    signal.addEventListener('abort', () => {
      clearTimeout(to);
      reject(makeAbortError());
    }, { once: true });
    p.then((v) => { clearTimeout(to); resolve(v); }, (e) => { clearTimeout(to); reject(e); });
  });
}

export async function runAuction(input: AuctionInput, baseUrl: string): Promise<AuctionOutput> {
  registerDefaultAdapters();
  const end = auctionLatencySeconds.startTimer();
  const requestId = input.requestId || crypto.randomUUID();
  try {
    const adapters = getAdaptersForFormat(input.adFormat);
    if (adapters.length === 0) {
      rtbErrorsTotal.inc({ code: 'NO_ADAPTER', adapter: 'none' });
      return { success: false, reason: 'NO_ADAPTER' };
    }

    const abort = new AbortController();
    const deadline = Date.now() + AUCTION_TTL_MS;

    const tasks = adapters.map(async (a) => bidWithAdapter(a, input, abort.signal, deadline));
    const results = await Promise.all(tasks);

    const bids = results.filter((r) => r && !(r as any).nobid) as any[] as Array<ReturnType<AdapterDefinition['requestBid']> extends Promise<infer R> ? Exclude<R, { nobid: true }> : never>;

    if (bids.length === 0) {
      try { rtbNoFillTotal.inc(); } catch {}
      return { success: true, response: undefined, reason: 'NO_BID' };
    }

    // Pick best by CPM then latency
    bids.sort((a: any, b: any) => (b.cpm - a.cpm) || ((a.latencyMs || 9999) - (b.latencyMs || 9999)));
    const winner = bids[0] as any;

    // cancel others
    abort.abort();

    const bidId = crypto.randomUUID();
    const impressionToken = signToken({
      bidId,
      placementId: input.placementId,
      adapter: winner.adapter,
      cpm: winner.cpm,
      currency: 'USD',
      purpose: 'imp',
      nonce: crypto.randomUUID(),
    }, TRACK_TOKEN_TTL_SEC);

    const clickToken = signToken({
      bidId,
      placementId: input.placementId,
      adapter: winner.adapter,
      cpm: winner.cpm,
      currency: 'USD',
      purpose: 'click',
      nonce: crypto.randomUUID(),
    }, TRACK_TOKEN_TTL_SEC);

    const deliveryToken = signToken({
      bidId,
      placementId: input.placementId,
      adapter: winner.adapter,
      cpm: winner.cpm,
      currency: 'USD',
      purpose: 'delivery',
      nonce: crypto.randomUUID(),
      url: winner.creativeUrl,
    }, DELIVERY_TOKEN_TTL_SEC);

    const impression = `${baseUrl}/t/imp?token=${encodeURIComponent(impressionToken)}`;
    const click = `${baseUrl}/t/click?token=${encodeURIComponent(clickToken)}`;
    const creativeUrl = `${baseUrl}/creative?token=${encodeURIComponent(deliveryToken)}`;

    try { rtbWinsTotal.inc({ adapter: winner.adapter }); } catch {}

    return {
      success: true,
      response: {
        requestId,
        bidId,
        adapter: winner.adapter,
        cpm: winner.cpm,
        currency: 'USD',
        ttlSeconds: winner.ttlSeconds || 300,
        creativeUrl,
        tracking: { impression, click },
        payload: winner.meta || {},
        consentEcho: input.consent || {},
      }
    };
  } finally {
    try { end(); } catch {}
  }
}

async function bidWithAdapter(adapter: AdapterDefinition, req: AdapterBidRequest, signal: AbortSignal, deadlineTs: number) {
  const remaining = Math.max(1, deadlineTs - Date.now());
  const perAdapterTimeout = Math.min(adapter.timeoutMs, remaining);
  const ctl = new AbortController();
  const onAbort = () => ctl.abort();
  signal.addEventListener('abort', onAbort, { once: true });
  try {
    return await withTimeout(adapter.requestBid({ signal: ctl.signal, deadlineMs: perAdapterTimeout }, req), perAdapterTimeout, ctl.signal);
  } catch (e) {
    return { nobid: true, reason: (e as any)?.name === 'AbortError' ? 'TIMEOUT' : 'ERROR' };
  } finally {
    signal.removeEventListener('abort', onAbort);
  }
}
