import * as path from 'node:path';

describe('vraBuildExpected.js — safety caps and force bypass', () => {
  const scriptPath = path.resolve(__dirname, '..', 'vraBuildExpected.js');

  const originalArgv = process.argv.slice();
  let exitSpy: jest.SpyInstance | undefined;

  beforeEach(() => {
    jest.resetModules();
    process.argv = originalArgv.slice(0, 2);
    exitSpy = jest.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`process.exit called with "${code ?? 0}"`);
    }) as never);
  });

  afterEach(() => {
    exitSpy?.mockRestore();
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

  async function runCli() {
    const imported = await import(scriptPath);
    const runner = (imported as { main?: () => Promise<void>; default?: { main?: () => Promise<void> } });
    const invoke = runner.main || runner.default?.main;
    if (!invoke) {
      throw new Error('CLI main export not found');
    }
    await invoke();
  }

  async function expectExit(code: number) {
    exitSpy?.mockClear();
    await runCli().catch((err) => {
      const msg = String(err?.message ?? '');
      if (!msg.startsWith('process.exit called with')) {
        throw err;
      }
    });
    const calls = exitSpy?.mock.calls ?? [];
    if (!calls.length) {
      throw new Error('process.exit was not called');
    }
    const firstCode = calls[0]?.[0];
    expect(firstCode).toBe(code);
  }

  it('enforces --limit cap (10k) without --force --yes → EXIT 20', async () => {
    mockDeps({ seen: 10, written: 10 });

    process.argv = [
      process.execPath,
      scriptPath,
      '--from', '2025-11-01T00:00:00Z',
      '--to', '2025-11-02T00:00:00Z',
      '--limit', '20000',
      '--dry-run', 'true',
    ];
    await expectExit(20);
  });

  it('bypasses --limit cap with --force --yes; dry-run EXIT 0/10 based on rows', async () => {
    // Have some rows so dry-run exits 0
    mockDeps({ seen: 3, written: 3 });

    process.argv = [
      process.execPath,
      scriptPath,
      '--from', '2025-11-01T00:00:00Z',
      '--to', '2025-11-02T00:00:00Z',
      '--limit', '25000',
      '--force', 'true',
      '--yes', 'true',
      '--dry-run', 'true',
    ];
    await expectExit(0);
  });

  it('rejects invalid ISO timestamps → EXIT 20', async () => {
    mockDeps();

    process.argv = [
      process.execPath,
      scriptPath,
      '--from', 'not-a-date',
      '--to', '2025-11-02T00:00:00Z',
      '--limit', '100',
      '--dry-run', 'true',
    ];
    await expectExit(20);
  });

  it('rejects negative or zero --limit → EXIT 20', async () => {
    mockDeps();

    // negative limit
    process.argv = [
      process.execPath,
      scriptPath,
      '--from', '2025-11-01T00:00:00Z',
      '--to', '2025-11-02T00:00:00Z',
      '--limit', '-5',
      '--dry-run', 'true',
    ];
    await expectExit(20);

    jest.resetModules();
    // zero limit
    process.argv = [
      process.execPath,
      scriptPath,
      '--from', '2025-11-01T00:00:00Z',
      '--to', '2025-11-02T00:00:00Z',
      '--limit', '0',
      '--dry-run', 'true',
    ];
    await expectExit(20);
  });
});
