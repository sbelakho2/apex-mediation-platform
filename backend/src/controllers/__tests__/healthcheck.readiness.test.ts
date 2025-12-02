type MockPoolOptions = {
  replicaRows?: Array<{ application_name: string; replay_lag_ms?: number; write_lag_ms?: number }>;
  stagingRows?: Array<{ table_name: string; row_estimate: number }>;
  cacheHits?: number;
  cacheReads?: number;
  failReplica?: boolean;
};

const mockRedis = { isReady: jest.fn(() => true) };

jest.mock('../../utils/redis', () => ({
  redis: mockRedis,
}));

function makeMockPool(options: MockPoolOptions = {}) {
  return {
    query: jest.fn(async (sql: string) => {
      if (/SELECT 1/.test(sql)) {
        return { rows: [{ '?column?': 1 }] };
      }
      if (sql.includes('pg_stat_replication')) {
        if (options.failReplica) {
          throw new Error('replica failure');
        }
        return { rows: options.replicaRows ?? [] };
      }
      if (sql.includes('pg_stat_database')) {
        return {
          rows: [
            {
              hits: options.cacheHits ?? 1000,
              reads: options.cacheReads ?? 0,
            },
          ],
        };
      }
      if (sql.includes('pg_stat_user_tables')) {
        return {
          rows: options.stagingRows ?? [{ table_name: 'analytics_impressions_stage', row_estimate: 100 }],
        };
      }
      return { rows: [{ '?column?': 1 }] };
    }),
  } as any;
}

function createMockRes() {
  const res: any = {};
  res.statusCode = 200;
  res.body = null as any;
  res.status = (code: number) => {
    res.statusCode = code;
    return res;
  };
  res.json = (payload: any) => {
    res.body = payload;
    return res;
  };
  return res;
}

const baseConfig = {
  replicaRequired: false,
  readinessThresholds: {
    dbSlowMs: 1000,
    replicaLagWarnMs: 5000,
    replicaLagCriticalMs: 15000,
    stagingWarnRows: 250000,
    cacheHitWarnRatio: 0.9,
  },
};

describe('HealthCheckController.readiness', () => {
  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('returns 503 when replica health cannot be established while required', async () => {
    jest.doMock('../../config/index', () => ({
      __esModule: true,
      default: { ...baseConfig, replicaRequired: true },
    }));

    const { HealthCheckController: Controller } = await import('../../controllers/HealthCheckController');
    const controller = new Controller(makeMockPool({ replicaRows: [] }));
    const res = createMockRes();
    await controller.readiness({} as any, res as any);

    expect(res.statusCode).toBe(503);
    expect(res.body?.message).toMatch(/Read replica/);
  });

  it('returns 503 when staging backlog exceeds guardrail', async () => {
    jest.doMock('../../config/index', () => ({
      __esModule: true,
      default: { ...baseConfig, readinessThresholds: { ...baseConfig.readinessThresholds, stagingWarnRows: 10 } },
    }));

    const { HealthCheckController: Controller } = await import('../../controllers/HealthCheckController');
    const controller = new Controller(
      makeMockPool({
        replicaRows: [{ application_name: 'replica-1', replay_lag_ms: 100, write_lag_ms: 50 }],
        stagingRows: [{ table_name: 'analytics_impressions_stage', row_estimate: 500 }],
      })
    );

    const res = createMockRes();
    await controller.readiness({} as any, res as any);

    expect(res.statusCode).toBe(503);
    expect(res.body?.message).toMatch(/staging backlog/i);
  });

  it('returns 200 when all readiness signals stay within guardrails', async () => {
    jest.doMock('../../config/index', () => ({ __esModule: true, default: baseConfig }));

    const { HealthCheckController: Controller } = await import('../../controllers/HealthCheckController');
    const controller = new Controller(
      makeMockPool({
        replicaRows: [{ application_name: 'replica-1', replay_lag_ms: 10, write_lag_ms: 5 }],
        stagingRows: [{ table_name: 'analytics_impressions_stage', row_estimate: 5 }],
        cacheHits: 900,
        cacheReads: 100,
      })
    );

    const res = createMockRes();
    await controller.readiness({} as any, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.body?.replica?.hasReplicas).toBe(true);
    expect(res.body?.staging?.totalRows).toBe(5);
    expect(res.body?.cache?.hit_ratio).toBeGreaterThan(0.8);
  });
});
