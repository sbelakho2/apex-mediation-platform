import * as path from 'node:path';

describe('vraReconcile.js — dry-run semantics and safety caps', () => {
  const scriptPath = path.resolve(__dirname, '..', 'vraReconcile.js');

  const originalArgv = process.argv.slice();
  const originalExit = process.exit;

  beforeEach(() => {
    jest.resetModules();
    process.argv = originalArgv.slice(0, 2);
  });

  afterAll(() => {
    process.argv = originalArgv;
    // @ts-ignore
    process.exit = originalExit;
  });

  function mockDeps({ deltas = 2, inserted = 0 } = {}) {
    // Mock ClickHouse utils
    jest.doMock('../src/utils/clickhouse', () => ({
      initializeClickHouse: jest.fn(async () => {}),
      closeClickHouse: jest.fn(async () => {}),
    }), { virtual: true });
    // Mock reconcile service
    jest.doMock('../src/services/vra/reconcile', () => ({
      reconcileWindow: jest.fn(async () => ({
        inserted,
        deltas,
        amounts: { expectedUsd: 100, paidUsd: 90, unmatchedUsd: 10, underpayUsd: 0, timingLagUsd: 10 },
      })),
    }), { virtual: true });
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

    const exitSpy = jest
      .spyOn(process, 'exit')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .mockImplementation(((code?: number) => { throw new Error(`EXIT ${code}`); }) as any);

    try {
      await import(scriptPath);
      throw new Error('expected process.exit');
    } catch (e: any) {
      expect(String(e.message)).toBe('EXIT 10');
    } finally {
      exitSpy.mockRestore();
    }
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

    const exitSpy = jest
      .spyOn(process, 'exit')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .mockImplementation(((code?: number) => { throw new Error(`EXIT ${code}`); }) as any);

    try {
      await import(scriptPath);
      throw new Error('expected process.exit');
    } catch (e: any) {
      expect(String(e.message)).toBe('EXIT 20');
    } finally {
      exitSpy.mockRestore();
    }
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

    const exitSpy = jest
      .spyOn(process, 'exit')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .mockImplementation(((code?: number) => { throw new Error(`EXIT ${code}`); }) as any);

    try {
      await import(scriptPath);
      throw new Error('expected process.exit');
    } catch (e: any) {
      // dry-run yields inserted=0 → WARNINGS(10)
      expect(String(e.message)).toBe('EXIT 10');
    } finally {
      exitSpy.mockRestore();
    }
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

    const exitSpy = jest
      .spyOn(process, 'exit')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .mockImplementation(((code?: number) => { throw new Error(`EXIT ${code}`); }) as any);

    try {
      await import(scriptPath);
      throw new Error('expected process.exit');
    } catch (e: any) {
      // inserted=0 in dry-run → WARNINGS(10), but boundary window should not error out
      expect(String(e.message)).toBe('EXIT 10');
    } finally {
      exitSpy.mockRestore();
    }
  });
});
