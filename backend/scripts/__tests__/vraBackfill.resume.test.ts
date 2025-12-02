import * as path from 'node:path';
import * as fs from 'node:fs';

describe('vraBackfill.js orchestrator — resume/checkpoint semantics', () => {
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

  function mockSpawnReturning(code: number) {
    jest.doMock('node:child_process', () => ({
      spawn: jest.fn((_exec, _args, _opts) => {
        const listeners: Record<string, Function[]> = { close: [], error: [] };
        const fake = {
          on: (event: string, cb: Function) => {
            (listeners[event] = listeners[event] || []).push(cb);
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

  async function runCli() {
    const imported = await import(scriptPath);
    const mod = imported as { main?: () => Promise<void>; default?: { main?: () => Promise<void> } };
    const invoke = mod.main || mod.default?.main;
    if (!invoke) throw new Error('CLI main export not found');
    await invoke();
  }

  it('skips completed stages on re-run using checkpoint file', async () => {
    mockSpawnReturning(0);

    // Unique checkpoint file per test run
    const ckFile = path.resolve(process.cwd(), 'logs', `vra-backfill-resume-${Date.now()}.json`);
    try { fs.unlinkSync(ckFile); } catch {}

    const commonArgs = [
      process.execPath,
      scriptPath,
      '--from', '2025-11-01T00:00:00Z',
      '--to', '2025-11-01T12:00:00Z',
      '--step', 'expected',
      '--dry-run', 'true',
      '--checkpoint', ckFile,
    ];

    // First run — should execute the stage and mark checkpoint
    process.argv = [...commonArgs];
    const exitSpy1 = jest
      .spyOn(process, 'exit')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .mockImplementation(((code?: number) => { throw new Error(`EXIT1 ${code ?? 0}`); }) as any);

    try {
      await runCli();
      throw new Error('expected process.exit (first)');
    } catch (e: any) {
      expect(String(e?.message ?? '')).toBe('EXIT1 0');
    } finally {
      exitSpy1.mockRestore();
    }

    // Second run — should detect checkpoint and skip stage (capture log)
    jest.resetModules();
    const logs: string[] = [];
    const logSpy = jest.spyOn(console, 'log').mockImplementation((...args: any[]) => {
      logs.push(args.map(String).join(' '));
    });

    process.argv = [...commonArgs];
    const exitSpy2 = jest
      .spyOn(process, 'exit')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .mockImplementation(((code?: number) => { throw new Error(`EXIT2 ${code ?? 0}`); }) as any);

    try {
      await runCli();
      throw new Error('expected process.exit (second)');
    } catch (e: any) {
      expect(String(e?.message ?? '')).toBe('EXIT2 0');
    } finally {
      exitSpy2.mockRestore();
      logSpy.mockRestore();
    }

    // Assert skip message present
    expect(logs.join('\n')).toMatch(/Skipping stage "expected"/i);

    // Clean up
    try { fs.unlinkSync(ckFile); } catch {}
  });
});
