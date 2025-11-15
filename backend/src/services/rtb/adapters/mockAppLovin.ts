import { AdapterDefinition, AdapterBidRequest, AdapterBid, NoBid, AuctionContext } from './types';
import { rtbAdapterLatencySeconds, rtbAdapterTimeoutsTotal } from '../../../utils/prometheus';
import { safeInc } from '../../../utils/metrics';

const sleep = (ms: number, signal?: AbortSignal) => new Promise<void>((resolve, reject) => {
  const t = setTimeout(() => resolve(), ms);
  if (signal) {
    signal.addEventListener('abort', () => {
      clearTimeout(t);
      reject(new DOMException('Aborted', 'AbortError'));
    }, { once: true });
  }
});

export function mockAppLovin(): AdapterDefinition {
  const name = 'applovin';
  const timeoutMs = parseInt(process.env.RTB_APPLOVIN_TIMEOUT_MS || '110', 10);
  return {
    name,
    supports: ['interstitial', 'rewarded', 'banner'],
    timeoutMs,
    async requestBid(ctx: AuctionContext, req: AdapterBidRequest): Promise<AdapterBid | NoBid> {
      const end = rtbAdapterLatencySeconds.startTimer({ adapter: name });
      const jitter = 30 + Math.floor(Math.random() * 70); // 30-100ms
      const latency = Math.min(jitter, timeoutMs - 5);
      try {
        if (ctx.signal.aborted) throw new DOMException('Aborted', 'AbortError');
        await sleep(latency, ctx.signal);
        // No bid if floor > 1.8
        const base = 1.8;
        if (req.floorCpm > base) return { nobid: true };
        const cpm = +(base + Math.random() * 0.6).toFixed(2);
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
        if (e?.name === 'AbortError') {
          safeInc(rtbAdapterTimeoutsTotal, { adapter: name });
          return { nobid: true, reason: 'TIMEOUT' };
        }
        return { nobid: true, reason: 'ERROR' };
      } finally {
        try { end({ adapter: name }); } catch (e3) { void e3; }
      }
    },
  };
}
