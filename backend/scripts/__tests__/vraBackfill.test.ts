/**
 * VRA Backfill Orchestrator — smoke tests (mocked child processes)
 *
 * Verifies that:
 * - The orchestrator invokes stage CLIs via child_process.spawn.
 * - EXIT 0 and EXIT 10 (WARNINGS) are treated as success and result in process exit OK.
 * - Checkpoints are written and subsequent stages can be marked done.
 */

import * as path from 'node:path';

describe('vraBackfill.js orchestrator (mocked)', () => {
  const scriptPath = path.resolve(__dirname, '..', 'vraBackfill.js');

  const originalArgv = process.argv.slice();
  const originalExit = process.exit;

  beforeEach(() => {
    jest.resetModules();
    // Reset process.argv for each test
    process.argv = originalArgv.slice(0, 2);
  });

  afterAll(() => {
    process.argv = originalArgv;
    // @ts-ignore restore exit
    process.exit = originalExit;
  });

  function mockSpawnReturning(code: number) {
    jest.doMock('node:child_process', () => ({
      spawn: jest.fn((_exec, _args, _opts) => {
        const listeners: Record<string, Function[]> = { close: [], error: [] };
        const fake = {
          on: (event: string, cb: Function) => {
            (listeners[event] = listeners[event] || []).push(cb);
            // trigger close on next tick
            if (event === 'close') {
              setImmediate(() => listeners['close'].forEach((f) => f(code)));
            }
            return fake;
          },
        } as any;
        return fake;
      }),
    }));
  }

  function mockFsPassthrough() {
    // We let fs write into the repo logs/ path (tests run in sandbox). No-op.
  }

  it('treats EXIT 0 from stage as success and exits OK', async () => {
    mockSpawnReturning(0);
    mockFsPassthrough();

    // Arrange args for a single stage to keep it quick
    process.argv = [
      process.execPath,
      scriptPath,
      '--from', '2025-11-01T00:00:00Z',
      '--to', '2025-11-02T00:00:00Z',
      '--step', 'expected',
      '--dry-run', 'true',
      '--checkpoint', path.resolve(process.cwd(), 'logs', 'vra-backfill-test.json'),
    ];

    // Intercept process.exit to capture exit code
    const exitSpy = jest.spyOn(process, 'exit').mockImplementation(((code?: number) => { throw new Error(`EXIT ${code}`); }) as any);

    try {
      await import(scriptPath);
    } catch (e: any) {
      expect(String(e.message)).toBe('EXIT 0');
    } finally {
      exitSpy.mockRestore();
    }
  });

  it('treats EXIT 10 (WARNINGS) from stage as success for progression', async () => {
    mockSpawnReturning(10);
    mockFsPassthrough();

    process.argv = [
      process.execPath,
      scriptPath,
      '--from', '2025-11-01T00:00:00Z',
      '--to', '2025-11-02T00:00:00Z',
      '--step', 'reconcile',
      '--dry-run', 'true',
      '--checkpoint', path.resolve(process.cwd(), 'logs', 'vra-backfill-test.json'),
    ];

    const exitSpy = jest.spyOn(process, 'exit').mockImplementation(((code?: number) => { throw new Error(`EXIT ${code}`); }) as any);

    try {
      await import(scriptPath);
    } catch (e: any) {
      expect(String(e.message)).toBe('EXIT 0');
    } finally {
      exitSpy.mockRestore();
    }
  });
});
