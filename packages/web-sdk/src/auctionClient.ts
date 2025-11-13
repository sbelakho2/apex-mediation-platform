import { AdResponseSchema } from './schemas';
import type { AdRequest, AdResponse, ConsentState, InitOptions } from './types';
import { Errors, SdkError } from './errors';

export type AuctionClientConfig = Required<Pick<InitOptions, 'endpoint' | 'timeoutMs'>> & {
  publisherId?: string;
  appId?: string;
  sdkVersion: string;
};

export async function requestAuction(
  cfg: AuctionClientConfig,
  consent: ConsentState | undefined,
  req: AdRequest
): Promise<AdResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), cfg.timeoutMs);

  try {
    const res = await fetch(`${cfg.endpoint.replace(/\/$/, '')}/auction`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        request: req,
        consent: consent ?? {},
        meta: {
          sdk: { name: '@rivalapex/web-sdk', version: cfg.sdkVersion },
          publisherId: cfg.publisherId,
          appId: cfg.appId,
        },
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      let body: unknown = undefined;
      try { body = await res.json(); } catch { /* ignore */ }
      throw Errors.badResponse(res.status, body);
    }

    let json: unknown;
    try {
      json = await res.json();
    } catch (e) {
      throw Errors.badResponse(200, { parseError: String(e) });
    }

    const parsed = AdResponseSchema.safeParse(json);
    if (!parsed.success) {
      throw Errors.validation('Invalid ad response schema', { issues: parsed.error.issues });
    }

    const data = parsed.data;
    if (!data.fill) {
      throw Errors.noFill();
    }

    return data;
  } catch (e: any) {
    if (e instanceof SdkError) throw e;
    if (e?.name === 'AbortError') throw Errors.timeout(cfg.timeoutMs);
    throw Errors.network('Network error while requesting auction', undefined, e);
  } finally {
    clearTimeout(timer);
  }
}
