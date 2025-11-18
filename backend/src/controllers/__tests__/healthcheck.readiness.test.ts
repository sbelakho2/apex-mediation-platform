import { HealthCheckController } from '../../controllers/HealthCheckController';

// Mock Redis readiness
jest.mock('../../utils/redis', () => ({
  redis: { isReady: () => true },
}));

// Helper to create a mock Pool with quick SELECT 1
function makeMockPool() {
  return {
    query: async (_sql: string) => ({ rows: [{ '?column?': 1 }] }),
  } as any;
}

function createMockRes() {
  const res: any = {};
  res.statusCode = 200;
  res.body = null as any;
  res.status = (code: number) => { res.statusCode = code; return res; };
  res.json = (payload: any) => { res.body = payload; return res; };
  return res;
}

describe('HealthCheckController.readiness', () => {
  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('returns 503 when ClickHouse is required and unhealthy', async () => {
    // Mock config to require ClickHouse
    jest.doMock('../../config/index', () => ({ __esModule: true, default: { clickhouseRequired: true } }));
    // Mock CH health to false
    jest.doMock('../../utils/clickhouse', () => ({ checkClickHouseHealth: async () => false }));
    const { HealthCheckController: Ctlr } = await import('../../controllers/HealthCheckController');
    const controller = new Ctlr(makeMockPool());
    const req: any = {};
    const res = createMockRes();
    await controller.readiness(req, res as any);
    expect(res.statusCode).toBe(503);
    expect(res.body?.status).toBeDefined();
    expect(res.body?.clickhouse?.healthy).toBe(false);
  });

  it('returns 200 when ClickHouse is healthy or not required', async () => {
    jest.doMock('../../config/index', () => ({ __esModule: true, default: { clickhouseRequired: false } }));
    jest.doMock('../../utils/clickhouse', () => ({ checkClickHouseHealth: async () => true }));
    const { HealthCheckController: Ctlr } = await import('../../controllers/HealthCheckController');
    const controller = new Ctlr(makeMockPool());
    const req: any = {};
    const res = createMockRes();
    await controller.readiness(req, res as any);
    expect(res.statusCode).toBe(200);
    expect(res.body?.database?.connected).toBe(true);
    expect(res.body?.clickhouse?.healthy).toBe(true);
  });
});
