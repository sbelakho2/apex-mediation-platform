import { getStatus } from '../../controllers/rtb.controller';

// Mock adapter registry to return a stable set of adapters
jest.mock('../../services/rtb/adapterRegistry', () => ({
  getAllAdapters: () => ([
    { name: 'mockAdmob', supports: ['banner'], timeoutMs: 800 },
    { name: 'mockUnityAds', supports: ['interstitial'], timeoutMs: 900 },
  ]),
}));

// Mock config to enable breakers for this test
jest.mock('../../config/index', () => ({
  __esModule: true,
  default: {
    redisBreakersEnabled: true,
  },
}));

// Mock breaker summary to return deterministic values
jest.mock('../../utils/redisCircuitBreaker', () => ({
  getSummary: async (names: string[]) => {
    const obj: Record<string, { open: boolean; failuresWindow: number }> = {};
    for (const n of names) {
      obj[n] = { open: n === 'mockAdmob', failuresWindow: n === 'mockAdmob' ? 7 : 0 };
    }
    return obj;
  },
}));

function createMockRes() {
  const res: any = {};
  res.statusCode = 200;
  res.status = (code: number) => { res.statusCode = code; return res; };
  res.jsonPayload = null as any;
  res.json = (payload: any) => { res.jsonPayload = payload; return res; };
  return res;
}

describe('GET /api/v1/rtb/status (controller)', () => {
  it('returns adapters and circuit breaker summary when enabled', async () => {
    const req: any = { };
    const res = createMockRes();
    await getStatus(req, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.jsonPayload).toBeTruthy();
    expect(res.jsonPayload.success).toBe(true);
    expect(res.jsonPayload.data).toBeTruthy();

    const data = res.jsonPayload.data;
    expect(Array.isArray(data.adapters)).toBe(true);
    expect(data.adapters.length).toBeGreaterThanOrEqual(2);
    expect(typeof data.circuitBreakers).toBe('object');
    // Check mocked summary applied
    expect(data.circuitBreakers['mockAdmob']).toEqual({ open: true, failuresWindow: 7 });
    expect(data.circuitBreakers['mockUnityAds']).toEqual({ open: false, failuresWindow: 0 });
    expect(data.breakersEnabled).toBe(true);
  });
});
