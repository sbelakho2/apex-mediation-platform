import * as path from 'node:path';

describe('vraReconcile.js — dry-run semantics and safety caps', () => {
  const scriptPath = path.resolve(__dirname, '..', 'vraReconcile.js');

  const originalArgv = process.argv.slice();

  beforeEach(() => {
    jest.resetModules();
    process.argv = originalArgv.slice(0, 2);
  });

  afterAll(() => {
    process.argv = originalArgv;
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

    await expect(import(scriptPath)).rejects.toThrow('process.exit called with "10"');
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

    await expect(import(scriptPath)).rejects.toThrow('process.exit called with "20"');
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

    await expect(import(scriptPath)).rejects.toThrow('process.exit called with "10"');
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

    await expect(import(scriptPath)).rejects.toThrow('process.exit called with "10"');
  });
});
