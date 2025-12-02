import * as path from 'node:path';

describe('vraReconcile.js — safety caps and dry-run/exit codes', () => {
  const scriptPath = path.resolve(__dirname, '..', 'vraReconcile.js');

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

  function mockDeps({ deltas = 1, inserted = 1 } = {}) {
    // Mock reconcileWindow implementation
    jest.doMock('../src/services/vra/reconcile', () => ({
      reconcileWindow: jest.fn(async () => ({
        deltas,
        inserted,
        amounts: { expectedUsd: 0, paidUsd: 0, unmatchedUsd: 0, underpayUsd: 0, timingLagUsd: 0 },
      })),
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

  it('rejects invalid ISO timestamps → EXIT 20', async () => {
    mockDeps();
    process.argv = [
      process.execPath,
      scriptPath,
      '--from', 'not-a-date',
      '--to', '2025-11-02T00:00:00Z',
      '--dry-run', 'true',
    ];
    await expectExit(20);
  });

  it('rejects inverted window (from > to) → EXIT 20', async () => {
    mockDeps();
    process.argv = [
      process.execPath,
      scriptPath,
      '--from', '2025-11-03T00:00:00Z',
      '--to', '2025-11-02T00:00:00Z',
      '--dry-run', 'true',
    ];
    await expectExit(20);
  });

  it('enforces 3-day window cap without --force --yes → EXIT 20', async () => {
    mockDeps();
    process.argv = [
      process.execPath,
      scriptPath,
      '--from', '2025-11-01T00:00:00Z',
      '--to', '2025-11-05T00:00:00Z',
      '--dry-run', 'true',
    ];
    await expectExit(20);
  });

  it('bypasses 3-day cap with --force --yes; dry-run exits 0/10 based on work', async () => {
    // Have some work → EXIT 0 even in dry-run (since deltas>0 and inserted>0 in mocked result)
    mockDeps({ deltas: 2, inserted: 2 });
    process.argv = [
      process.execPath,
      scriptPath,
      '--from', '2025-11-01T00:00:00Z',
      '--to', '2025-11-05T00:00:00Z',
      '--force', 'true',
      '--yes', 'true',
      '--dry-run', 'true',
    ];
    await expectExit(0);
  });

  it('exits 10 (WARNINGS) when no work (deltas==0 or inserted==0)', async () => {
    mockDeps({ deltas: 0, inserted: 0 });
    process.argv = [
      process.execPath,
      scriptPath,
      '--from', '2025-11-01T00:00:00Z',
      '--to', '2025-11-02T00:00:00Z',
      '--dry-run', 'true',
    ];
    await expectExit(10);
  });
});
