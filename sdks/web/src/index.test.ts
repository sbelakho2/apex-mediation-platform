import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ApexMediation } from './index';

// Helper to reset SDK between tests by creating a new instance via require cache busting
function freshSDK() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mod = require('./index');
  return mod.ApexMediation as typeof ApexMediation;
}

describe('Web SDK (ApexMediation)', () => {
  beforeEach(() => {
    // @ts-ignore
    global.fetch = undefined;
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-01T00:00:00Z'));
  });

  it('initializes and emits ready', async () => {
    const sdk = freshSDK();
    const spy = vi.fn();
    sdk.on('ready', spy);
    sdk.initialize({ apiKey: 'k', publisherId: 'pub' });
    expect(spy).toHaveBeenCalled();
  });

  it('returns offline stub when no auctionUrl is configured', async () => {
    const sdk = freshSDK();
    sdk.initialize({ apiKey: 'k', publisherId: 'pub' });
    const res = await sdk.loadInterstitial({ placementId: 'pl1' });
    expect(res.adapter).toBe('stub');
    expect(res.ecpm).toBeGreaterThan(0);
    expect(res.currency).toBe('USD');
  });

  it('maps non-OK HTTP to status_XXX and emits interstitial_error', async () => {
    const sdk = freshSDK();
    sdk.initialize({ apiKey: 'k', publisherId: 'pub', auctionUrl: 'http://localhost:9999' });

    // Mock fetch 400
    // @ts-ignore
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: 'Bad Request' }),
    });

    const errSpy = vi.fn();
    sdk.on('interstitial_error', errSpy);
    await expect(sdk.loadInterstitial({ placementId: 'pl1' })).rejects.toThrowError('status_400');
    expect(errSpy).toHaveBeenCalledWith('status_400');
  });

  it('maps AbortError to timeout and emits interstitial_error with timeout', async () => {
    const sdk = freshSDK();
    sdk.initialize({ apiKey: 'k', publisherId: 'pub', auctionUrl: 'http://localhost:9999', defaultTimeoutMs: 100 });

    // Mock fetch that never resolves until aborted
    // @ts-ignore
    global.fetch = vi.fn().mockImplementation((_url: string, opts: any) => {
      const signal: AbortSignal = opts.signal;
      return new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => {
          const e: any = new Error('Aborted');
          e.name = 'AbortError';
          reject(e);
        });
      });
    });

    const errSpy = vi.fn();
    sdk.on('interstitial_error', errSpy);
    const p = sdk.loadInterstitial({ placementId: 'pl1' });
    // advance time to trigger abort
    vi.advanceTimersByTime(120);
    await expect(p).rejects.toThrowError('timeout');
    expect(errSpy).toHaveBeenCalledWith('timeout');
  });

  it('emits interstitial_loaded on success and returns winner payload', async () => {
    const sdk = freshSDK();
    sdk.initialize({ apiKey: 'k', publisherId: 'pub', auctionUrl: 'http://localhost:9999' });

    const body = {
      winner: {
        adapter_name: 'admob',
        cpm: 2.5,
        currency: 'USD',
        creative_id: 'cr1',
        ad_markup: '<div/>',
      },
    };
    // @ts-ignore
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => body });

    const okSpy = vi.fn();
    sdk.on('interstitial_loaded', okSpy);

    const res = await sdk.loadInterstitial({ placementId: 'pl1' });
    expect(res.adapter).toBe('admob');
    expect(res.ecpm).toBe(2.5);
    expect(res.currency).toBe('USD');
    expect(okSpy).toHaveBeenCalled();
  });

  it('emits interstitial_no_fill when winner missing', async () => {
    const sdk = freshSDK();
    sdk.initialize({ apiKey: 'k', publisherId: 'pub', auctionUrl: 'http://localhost:9999' });
    // @ts-ignore
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });

    const nofill = vi.fn();
    sdk.on('interstitial_no_fill', nofill);
    await expect(sdk.loadInterstitial({ placementId: 'pl1' })).rejects.toThrowError('no_fill');
    expect(nofill).toHaveBeenCalledWith('no_fill');
  });
});
