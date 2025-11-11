import { AdapterDefinition, AdapterBidRequest, AdapterBid, NoBid, AuctionContext } from './types';
import { rtbAdapterLatencySeconds, rtbAdapterTimeoutsTotal } from '../../../utils/prometheus';

const sleep = (ms: number, signal?: AbortSignal) => new Promise<void>((resolve, reject) => {
  const t = setTimeout(() => resolve(), ms);
  if (signal) {
    signal.addEventListener('abort', () => {
      clearTimeout(t);
      reject(new DOMException('Aborted', 'AbortError'));
    }, { once: true });
  }
});

export function mockUnityAds(): AdapterDefinition {
  const name = 'unityads';
  const timeoutMs = parseInt(process.env.RTB_UNITYADS_TIMEOUT_MS || '100', 10);
  return {
    name,
    supports: ['interstitial', 'rewarded', 'banner', 'native'],
    timeoutMs,
    async requestBid(ctx: AuctionContext, req: AdapterBidRequest): Promise<AdapterBid | NoBid> {
      const end = rtbAdapterLatencySeconds.startTimer({ adapter: name });
      const jitter = 15 + Math.floor(Math.random() * 55); // 15-70ms
      const latency = Math.min(jitter, timeoutMs - 5);
      try {
        if (ctx.signal.aborted) throw new DOMException('Aborted', 'AbortError');
        await sleep(latency, ctx.signal);
        // No bid if floor > 1.4
        const base = 1.4;
        if (req.floorCpm > base) return { nobid: true };
        const cpm = +(base + Math.random() * 0.4).toFixed(2);
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
          try { rtbAdapterTimeoutsTotal.inc({ adapter: name }); } catch {}
          return { nobid: true, reason: 'TIMEOUT' };
        }
        return { nobid: true, reason: 'ERROR' };
      } finally {
        try { end({ adapter: name }); } catch {}
      }
    },
  };
}
