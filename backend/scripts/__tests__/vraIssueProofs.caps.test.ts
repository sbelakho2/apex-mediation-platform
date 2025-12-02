import * as path from 'node:path';

describe('vraIssueProofs.js — guardrails and behaviors', () => {
  const scriptPath = path.resolve(__dirname, '..', 'vraIssueProofs.js');

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

  function mockDeps({ hasExisting = false } = {}) {
    // Mock ClickHouse utils
    jest.doMock('../src/utils/clickhouse', () => ({
      initializeClickHouse: jest.fn(async () => {}),
      closeClickHouse: jest.fn(async () => {}),
      executeQuery: jest.fn(async () => (hasExisting ? [{ month: '2025-11', digest: 'old' }] : [])),
      insertBatch: jest.fn(async () => {}),
    }), { virtual: true });
  }

  async function runCli() {
    const imported = await import(scriptPath);
    const runner = imported as { main?: () => Promise<void>; default?: { main?: () => Promise<void> } };
    const invoke = runner.main || runner.default?.main;
    if (!invoke) throw new Error('CLI main export not found');
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

  it('rejects invalid --month → EXIT 20', async () => {
    mockDeps();
    process.argv = [process.execPath, scriptPath, '--month', '202511'];
    await expectExit(20);
  });

  it('dry-run path exits 10 (WARNINGS)', async () => {
    mockDeps();
    process.argv = [process.execPath, scriptPath, '--month', '2025-11', '--dry-run', 'true'];
    await expectExit(10);
  });

  it('create new month digest exits 0', async () => {
    mockDeps({ hasExisting: false });
    process.argv = [process.execPath, scriptPath, '--month', '2025-11'];
    await expectExit(0);
  });

  it('update existing month digest exits 0', async () => {
    mockDeps({ hasExisting: true });
    process.argv = [process.execPath, scriptPath, '--month', '2025-11'];
    await expectExit(0);
  });

  it('ClickHouse init failure → EXIT 20', async () => {
    // Override init to throw
    jest.doMock('../src/utils/clickhouse', () => ({
      initializeClickHouse: jest.fn(async () => { throw new Error('boom'); }),
      closeClickHouse: jest.fn(async () => {}),
      executeQuery: jest.fn(async () => []),
      insertBatch: jest.fn(async () => {}),
    }), { virtual: true });

    process.argv = [process.execPath, scriptPath, '--month', '2025-11'];
    await expectExit(20);
  });
});
