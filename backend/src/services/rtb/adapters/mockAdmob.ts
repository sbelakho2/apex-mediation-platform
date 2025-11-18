import { AdapterDefinition, AdapterBidRequest, AdapterBid, NoBid, AuctionContext, makeAbortError, isAbortError, validateAdapterBidRequest } from './types';
import { rtbAdapterLatencySeconds, rtbAdapterTimeoutsTotal } from '../../../utils/prometheus';
import { safeInc } from '../../../utils/metrics';
import logger from '../../../utils/logger';

const sleep = (ms: number, signal?: AbortSignal) => new Promise<void>((resolve, reject) => {
  const t = setTimeout(() => resolve(), ms);
  if (signal) {
    signal.addEventListener('abort', () => {
      clearTimeout(t);
      reject(makeAbortError());
    }, { once: true });
  }
});

export function mockAdmob(): AdapterDefinition {
  const name = 'admob';
  const timeoutMs = parseInt(process.env.RTB_ADMOB_TIMEOUT_MS || '90', 10);

  return {
    name,
    supports: ['banner', 'interstitial', 'rewarded', 'native'],
    timeoutMs,
    async requestBid(ctx: AuctionContext, req: AdapterBidRequest): Promise<AdapterBid | NoBid> {
      const end = rtbAdapterLatencySeconds.startTimer({ adapter: name });
      const jitter = 20 + Math.floor(Math.random() * 40); // 20-60ms
      const latency = Math.min(jitter, timeoutMs - 5);
      try {
        if (ctx.signal.aborted) {
          throw makeAbortError();
        }
        validateAdapterBidRequest(req);
        await sleep(latency, ctx.signal);
        // Very simple mock: bid only if floor <= 1.2
        const base = 1.5;
        if (req.floorCpm > base) return { nobid: true };
        const cpm = +(base + Math.random() * 0.5).toFixed(2);
        return {
          adapter: name,
          cpm,
          currency: 'USD',
          creativeUrl: `https://cdn.example.com/${name}/${req.adFormat}/creative.mp4`,
          ttlSeconds: 300,
          meta: { jitter, latency },
          latencyMs: latency,
        };
      } catch (e: any) {
        if (isAbortError(e)) {
          safeInc(rtbAdapterTimeoutsTotal, { adapter: name });
          return { nobid: true, reason: 'TIMEOUT' };
        }
        logger.warn('[RTB][mockAdmob] requestBid error', { error: (e as Error)?.message, latency, timeoutMs, placementId: (req as any)?.placementId });
        return { nobid: true, reason: 'ERROR' };
      } finally {
        try { end({ adapter: name }); } catch (e3) { void e3; }
      }
    },
  };
}
