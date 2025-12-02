import * as path from 'node:path';

describe('vraBackfill.js orchestrator — failure path (mocked)', () => {
  const scriptPath = path.resolve(__dirname, '..', 'vraBackfill.js');

  const originalArgv = process.argv.slice();
  const originalExit = process.exit;

  beforeEach(() => {
    jest.resetModules();
    process.argv = originalArgv.slice(0, 2);
  });

  afterAll(() => {
    process.argv = originalArgv;
    // @ts-ignore restore exit
    process.exit = originalExit;
  });

  async function runCli() {
    const imported = await import(scriptPath);
    const mod = imported as { main?: () => Promise<void>; default?: { main?: () => Promise<void> } };
    const invoke = mod.main || mod.default?.main;
    if (!invoke) throw new Error('CLI main export not found');
    await invoke();
  }

  function mockSpawnFailing(code: number) {
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

  it('exits with non-zero when stage returns error exit code', async () => {
    mockSpawnFailing(1);

    process.argv = [
      process.execPath,
      scriptPath,
      '--from', '2025-11-01T00:00:00Z',
      '--to', '2025-11-02T00:00:00Z',
      '--step', 'matching',
      '--dry-run', 'false',
      '--checkpoint', path.resolve(process.cwd(), 'logs', 'vra-backfill-failure.json'),
    ];

    const exitSpy = jest.spyOn(process, 'exit').mockImplementation(((code?: number) => { throw new Error(`EXIT ${code ?? 0}`); }) as any);

    try {
      await runCli();
      throw new Error('Should have thrown EXIT error');
    } catch (e: any) {
      expect(String(e.message)).toBe('EXIT 20');
    } finally {
      exitSpy.mockRestore();
    }
  });
});
