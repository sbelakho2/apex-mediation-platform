import * as path from 'node:path';

describe('vraBuildExpected.js — safety caps and force bypass', () => {
  const scriptPath = path.resolve(__dirname, '..', 'vraBuildExpected.js');

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

    const exitSpy = jest
      .spyOn(process, 'exit')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .mockImplementation(((code?: number) => { throw new Error(`EXIT ${code}`); }) as any);

    try {
      await import(scriptPath);
      throw new Error('expected process.exit');
    } catch (e: any) {
      expect(String(e.message)).toBe('EXIT 0');
    } finally {
      exitSpy.mockRestore();
    }
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

  it('rejects negative or zero --limit → EXIT 20', async () => {
    mockDeps();

    const exitSpy = jest
      .spyOn(process, 'exit')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .mockImplementation(((code?: number) => { throw new Error(`EXIT ${code}`); }) as any);

    // negative limit
    process.argv = [
      process.execPath,
      scriptPath,
      '--from', '2025-11-01T00:00:00Z',
      '--to', '2025-11-02T00:00:00Z',
      '--limit', '-5',
      '--dry-run', 'true',
    ];
    try {
      await import(scriptPath);
      throw new Error('expected process.exit');
    } catch (e: any) {
      expect(String(e.message)).toBe('EXIT 20');
    }

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
    try {
      await import(scriptPath);
      throw new Error('expected process.exit');
    } catch (e: any) {
      expect(String(e.message)).toBe('EXIT 20');
    } finally {
      exitSpy.mockRestore();
    }
  });
});
