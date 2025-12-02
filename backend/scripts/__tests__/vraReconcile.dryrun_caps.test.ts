import * as path from 'node:path';

describe('vraReconcile.js — dry-run semantics and safety caps', () => {
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
    // Mock reconcile service
    jest.doMock('../src/services/vra/reconcile', () => ({
      reconcileWindow: jest.fn(async () => ({
        inserted,
        deltas,
        amounts: { expectedUsd: 100, paidUsd: 90, unmatchedUsd: 10, underpayUsd: 0, timingLagUsd: 10 },
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

  it('dry-run exits with WARNINGS (10) when inserted=0 but deltas>0', async () => {
    mockDeps({ deltas: 3, inserted: 0 });

    process.argv = [
      process.execPath,
      scriptPath,
      '--from', '2025-11-01T00:00:00Z',
      '--to', '2025-11-01T12:00:00Z',
      '--dry-run', 'true',
    ];
    await expectExit(10);
  });

  it('enforces 3-day window cap without --force --yes (EXIT 20)', async () => {
    mockDeps({ deltas: 0, inserted: 0 });

    process.argv = [
      process.execPath,
      scriptPath,
      '--from', '2025-11-01T00:00:00Z',
      '--to', '2025-11-10T00:00:00Z',
      '--dry-run', 'true',
    ];
    await expectExit(20);
  });

  it('allows long window with --force --yes (EXIT 10 acceptable on dry-run)', async () => {
    mockDeps({ deltas: 1, inserted: 0 });

    process.argv = [
      process.execPath,
      scriptPath,
      '--from', '2025-11-01T00:00:00Z',
      '--to', '2025-11-10T00:00:00Z',
      '--dry-run', 'true',
      '--force', 'true',
      '--yes', 'true',
    ];
    await expectExit(10);
  });

  it('allows exactly 3-day window without force (boundary OK)', async () => {
    mockDeps({ deltas: 0, inserted: 0 });

    // exactly 72 hours
    process.argv = [
      process.execPath,
      scriptPath,
      '--from', '2025-11-01T00:00:00Z',
      '--to', '2025-11-04T00:00:00Z',
      '--dry-run', 'true',
    ];
    await expectExit(10);
  });
});
