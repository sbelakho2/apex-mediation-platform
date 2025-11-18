import { receivePostback } from '../../controllers/skadnetwork.controller';

// Helper to build mock res
function mockRes() {
  const res: any = {};
  res.statusCode = 200;
  res.body = null as any;
  res.status = (c: number) => { res.statusCode = c; return res; };
  res.json = (p: any) => { res.body = p; return res; };
  return res;
}

// Mock service to prevent DB access and return deterministic result
jest.mock('../../services/skadnetworkService', () => ({
  __esModule: true,
  skadnetworkService: {
    processPostback: jest.fn(async () => ({ success: true, attribution: { campaignId: '123', networkId: 'net', appId: 'app' } })),
  },
}));

describe('SKAdNetwork controller — receivePostback', () => {
  afterEach(() => {
    jest.resetModules();
  });

  it('rejects when X-SKAN-Secret is required and missing/incorrect', async () => {
    // Set secret
    process.env.SKADNETWORK_SHARED_SECRET = 'topsecret';
    const req: any = {
      header: (k: string) => (k === 'x-skan-secret' ? '' : ''),
      body: {
        version: '4.0',
        'ad-network-id': 'net',
        'campaign-id': '123',
        'app-id': 'app',
        'attribution-signature': 'sig',
      },
    };
    const res = mockRes();
    await receivePostback(req, res as any, (() => {}) as any);
    expect(res.statusCode).toBe(401);
    expect(res.body?.success).toBe(false);
  });

  it('accepts postback when secret matches (gate on) and returns success', async () => {
    process.env.SKADNETWORK_SHARED_SECRET = 'topsecret';
    const req: any = {
      header: (k: string) => (k.toLowerCase() === 'x-skan-secret' ? 'topsecret' : ''),
      body: {
        version: '4.0',
        'ad-network-id': 'net',
        'campaign-id': '123',
        'app-id': 'app',
        'attribution-signature': 'sig',
      },
    };
    const res = mockRes();
    await receivePostback(req, res as any, (() => {}) as any);
    expect(res.statusCode).toBe(200);
    expect(res.body?.success).toBe(true);
    expect(res.body?.data?.campaignId).toBe('123');
  });
});
