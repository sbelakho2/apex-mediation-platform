import * as path from 'node:path';

describe('vraMatch.js — guardrails and thresholds', () => {
  const scriptPath = path.resolve(__dirname, '..', 'vraMatch.js');

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

  function mockDeps() {
    jest.doMock('../src/utils/clickhouse', () => ({
      initializeClickHouse: jest.fn(async () => {}),
      closeClickHouse: jest.fn(async () => {}),
    }), { virtual: true });
  }

  it('rejects invalid ISO timestamps → EXIT 20', async () => {
    mockDeps();
    process.argv = [process.execPath, scriptPath, '--from', 'bad', '--to', '2025-11-02T00:00:00Z'];
    const exitSpy = jest.spyOn(process, 'exit').mockImplementation(((code?: number) => { throw new Error(`EXIT ${code}`); }) as any);
    await expect(import(scriptPath)).rejects.toThrow('EXIT 20');
    exitSpy.mockRestore();
  });

  it('rejects thresholds out of range → EXIT 20', async () => {
    mockDeps();
    process.argv = [process.execPath, scriptPath,
      '--from','2025-11-01T00:00:00Z','--to','2025-11-02T00:00:00Z',
      '--autoThreshold','-0.1','--minConf','1.1'];
    const exitSpy = jest.spyOn(process, 'exit').mockImplementation(((code?: number) => { throw new Error(`EXIT ${code}`); }) as any);
    await expect(import(scriptPath)).rejects.toThrow('EXIT 20');
    exitSpy.mockRestore();
  });

  it('enforces 3-day cap without --force --yes → EXIT 20', async () => {
    mockDeps();
    process.argv = [process.execPath, scriptPath,
      '--from','2025-11-01T00:00:00Z','--to','2025-11-05T00:00:00Z'];
    const exitSpy = jest.spyOn(process, 'exit').mockImplementation(((code?: number) => { throw new Error(`EXIT ${code}`); }) as any);
    await expect(import(scriptPath)).rejects.toThrow('EXIT 20');
    exitSpy.mockRestore();
  });

  it('bypasses 3-day cap with --force --yes; empty work → EXIT 10', async () => {
    mockDeps();
    process.argv = [process.execPath, scriptPath,
      '--from','2025-11-01T00:00:00Z','--to','2025-11-05T00:00:00Z',
      '--force','true','--yes','true'];
    const exitSpy = jest.spyOn(process, 'exit').mockImplementation(((code?: number) => { throw new Error(`EXIT ${code}`); }) as any);
    await expect(import(scriptPath)).rejects.toThrow('EXIT 10');
    exitSpy.mockRestore();
  });
});
