import * as path from 'node:path';

describe('vraMatch.js — guardrails and thresholds', () => {
  const scriptPath = path.resolve(__dirname, '..', 'vraMatch.js');

  const originalArgv = process.argv.slice();
  let exitSpy: jest.SpyInstance | undefined;

  beforeEach(() => {
    jest.resetModules();
    process.argv = originalArgv.slice(0, 2);
    exitSpy = jest.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`process.exit called with "${code ?? 0}"`);
    }) as never);
  });

  afterAll(() => {
    process.argv = originalArgv;
  });

  afterEach(() => {
    exitSpy?.mockRestore();
    exitSpy = undefined;
  });

  function mockDeps() {
    jest.doMock('../src/utils/clickhouse', () => ({
      initializeClickHouse: jest.fn(async () => {}),
      closeClickHouse: jest.fn(async () => {}),
    }), { virtual: true });
  }

  async function runCli() {
    const imported = await import(scriptPath);
    const mod = imported as { main?: () => Promise<void>; default?: { main?: () => Promise<void> } };
    const invoke = mod.main || mod.default?.main;
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

  it('rejects invalid ISO timestamps → EXIT 20', async () => {
    mockDeps();
    process.argv = [process.execPath, scriptPath, '--from', 'bad', '--to', '2025-11-02T00:00:00Z'];
    await expectExit(20);
  });

  it('rejects thresholds out of range → EXIT 20', async () => {
    mockDeps();
    process.argv = [process.execPath, scriptPath,
      '--from','2025-11-01T00:00:00Z','--to','2025-11-02T00:00:00Z',
      '--autoThreshold','-0.1','--minConf','1.1'];
    await expectExit(20);
  });

  it('enforces 3-day cap without --force --yes → EXIT 20', async () => {
    mockDeps();
    process.argv = [process.execPath, scriptPath,
      '--from','2025-11-01T00:00:00Z','--to','2025-11-05T00:00:00Z'];
    await expectExit(20);
  });

  it('bypasses 3-day cap with --force --yes; empty work → EXIT 10', async () => {
    mockDeps();
    process.argv = [process.execPath, scriptPath,
      '--from','2025-11-01T00:00:00Z','--to','2025-11-05T00:00:00Z',
      '--force','true','--yes','true'];
    await expectExit(10);
  });
});
