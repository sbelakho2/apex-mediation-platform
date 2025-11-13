import { init, setConsent, requestAd, on, Errors } from '../src';
import { state as mswState, timeoutHandler } from './msw/handlers';
import { server } from './msw/server';

describe('Web SDK', () => {
  beforeEach(() => {
    // reset MSW state
    mswState.lastAuctionBody = null;
  });

  it('throws if not initialized', async () => {
    await expect(requestAd({ placement: 'home', adType: 'banner' })).rejects.toMatchObject({ code: 'INIT_REQUIRED' });
  });

  it('initializes, sets consent, and requests ad successfully', async () => {
    init({ endpoint: 'https://ads.example.test', timeoutMs: 2000, sdkVersion: '0.1.0' });
    setConsent({ gdprApplies: true, tcfConsent: 'COabcd...', usPrivacy: '1YNN' });

    const resp = await requestAd({ placement: 'home', adType: 'banner', width: 300, height: 250 });
    expect(resp.fill).toBe(true);
    expect(resp.creative?.html).toContain('Ad');

    // Ensure consent propagated
    expect(mswState.lastAuctionBody?.consent).toMatchObject({ gdprApplies: true, tcfConsent: 'COabcd...', usPrivacy: '1YNN' });
    // Ensure meta present
    expect(mswState.lastAuctionBody?.meta?.sdk?.name).toBe('@rivalapex/web-sdk');
  });

  it('times out when server is slow', async () => {
    server.use(timeoutHandler);
    init({ endpoint: 'https://ads.example.test', timeoutMs: 50, sdkVersion: '0.1.0' });
    await expect(requestAd({ placement: 'slow', adType: 'banner' })).rejects.toMatchObject({ code: 'TIMEOUT' });
  });
});
