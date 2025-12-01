import * as path from 'node:path';

describe('vraBuildExpected.js — dry-run and exit semantics', () => {
  const scriptPath = path.resolve(__dirname, '..', 'vraBuildExpected.js');

  const originalArgv = process.argv.slice();

  beforeEach(() => {
    jest.resetModules();
    process.argv = originalArgv.slice(0, 2);
  });

  afterAll(() => {
    process.argv = originalArgv;
  });

  function mockDeps({ seen = 5, written = 5, skipped = 0 } = {}) {
    // Mock PG Pool
    jest.doMock('pg', () => ({
      Pool: class { async end() {} },
    }));
    // Mock ClickHouse utils
    jest.doMock('../src/utils/clickhouse', () => ({
      initializeClickHouse: jest.fn(async () => {}),
      closeClickHouse: jest.fn(async () => {}),
    }), { virtual: true });
    // Mock config
    jest.doMock('../src/config/index', () => ({
      __esModule: true,
      default: { databaseUrl: 'postgres://stub/stub' },
    }), { virtual: true });
    // Mock expectedBuilder
    jest.doMock('../src/services/vra/expectedBuilder', () => ({
      buildReconExpected: jest.fn(async () => ({ seen, written, skipped })),
    }), { virtual: true });
  }

  it('exits OK (0) on dry-run when seen/written > 0', async () => {
    mockDeps({ seen: 3, written: 3, skipped: 0 });

    process.argv = [
      process.execPath,
      scriptPath,
      '--from', '2025-11-01T00:00:00Z',
      '--to', '2025-11-02T00:00:00Z',
      '--limit', '100',
      '--dry-run', 'true',
    ];

    await expect(import(scriptPath)).rejects.toThrow('process.exit called with "0"');
  });

  it('exits with WARNINGS (10) when no rows written/seen', async () => {
    mockDeps({ seen: 0, written: 0, skipped: 0 });

    process.argv = [
      process.execPath,
      scriptPath,
      '--from', '2025-11-01T00:00:00Z',
      '--to', '2025-11-02T00:00:00Z',
      '--dry-run', 'true',
    ];

    await expect(import(scriptPath)).rejects.toThrow('process.exit called with "10"');
  });
});
