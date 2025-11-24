import * as path from 'node:path';

describe('vraBackfill.js orchestrator — spawn args for matching stage', () => {
  const scriptPath = path.resolve(__dirname, '..', 'vraBackfill.js');

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

  it('passes --autoThreshold and --minConf to vraMatch.js', async () => {
    const seen: string[][] = [];
    jest.doMock('node:child_process', () => ({
      spawn: jest.fn((exec: string, args: string[]) => {
        seen.push([exec, ...args]);
        const listeners: Record<string, Function[]> = { close: [], error: [] };
        const fake = {
          on: (event: string, cb: Function) => {
            (listeners[event] = listeners[event] || []).push(cb);
            if (event === 'close') setImmediate(() => listeners['close'].forEach((f) => f(0)));
            return fake;
          },
        } as any;
        return fake;
      }),
    }));

    process.argv = [
      process.execPath,
      scriptPath,
      '--from', '2025-11-01T00:00:00Z',
      '--to', '2025-11-02T00:00:00Z',
      '--step', 'matching',
      '--dry-run', 'true',
    ];

    const exitSpy = jest.spyOn(process, 'exit').mockImplementation(((code?: number) => { throw new Error(`EXIT ${code}`); }) as any);
    try {
      await import(scriptPath);
    } catch (e: any) {
      expect(String(e.message)).toBe('EXIT 0');
    } finally {
      exitSpy.mockRestore();
    }

    // Find the spawn call for vraMatch.js and verify flags
    const call = seen.find((c) => c[1]?.endsWith('vraMatch.js')) || [];
    const args = call.slice(2); // skip node exec and script path
    expect(args).toContain('--autoThreshold');
    expect(args).toContain('0.8');
    expect(args).toContain('--minConf');
    expect(args).toContain('0.5');
    expect(args).toContain('--dry-run');
  });
});
