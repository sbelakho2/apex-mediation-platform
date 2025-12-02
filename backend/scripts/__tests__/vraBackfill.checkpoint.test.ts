import * as path from 'node:path';
import * as fs from 'node:fs';

describe('vraBackfill.js orchestrator — checkpoint file', () => {
  const scriptPath = path.resolve(__dirname, '..', 'vraBackfill.js');
  const checkpoint = path.resolve(process.cwd(), 'logs', `vra-backfill-checkpoints-test-${Date.now()}.json`);

  const originalArgv = process.argv.slice();
  const originalExit = process.exit;

  beforeEach(() => {
    jest.resetModules();
    process.argv = originalArgv.slice(0, 2);
    try { fs.rmSync(checkpoint, { force: true }); } catch {}
  });

  afterAll(() => {
    process.argv = originalArgv;
    // @ts-ignore
    process.exit = originalExit;
    try { fs.rmSync(checkpoint, { force: true }); } catch {}
  });

  async function runCli() {
    const imported = await import(scriptPath);
    const mod = imported as { main?: () => Promise<void>; default?: { main?: () => Promise<void> } };
    const invoke = mod.main || mod.default?.main;
    if (!invoke) throw new Error('CLI main export not found');
    await invoke();
  }

  function mockSpawnReturning(code: number) {
    jest.doMock('node:child_process', () => ({
      spawn: jest.fn((_exec, _args, _opts) => {
        const listeners: Record<string, Function[]> = { close: [], error: [] };
        const fake = {
          on: (event: string, cb: Function) => {
            (listeners[event] = listeners[event] || []).push(cb);
            if (event === 'close') setImmediate(() => listeners['close'].forEach((f) => f(code)));
            return fake;
          },
        } as any;
        return fake;
      }),
    }));
  }

  it('writes a checkpoint marking stage as done (dry-run)', async () => {
    mockSpawnReturning(0);
    process.argv = [
      process.execPath,
      scriptPath,
      '--from', '2025-11-01T00:00:00Z',
      '--to', '2025-11-02T00:00:00Z',
      '--step', 'expected',
      '--dry-run', 'true',
      '--checkpoint', checkpoint,
    ];

    const exitSpy = jest.spyOn(process, 'exit').mockImplementation(((code?: number) => { throw new Error(`EXIT ${code ?? 0}`); }) as any);
    try {
      await runCli();
      throw new Error('expected process.exit');
    } catch (e: any) {
      expect(String(e.message)).toBe('EXIT 0');
    } finally {
      exitSpy.mockRestore();
    }

    // Verify checkpoint file was created and contains expected stage marker
    const txt = fs.readFileSync(checkpoint, 'utf8');
    const json = JSON.parse(txt);
    const key = Object.keys(json.runs)[0];
    expect(json.runs[key].stages.expected.done).toBe(true);
    expect(json.runs[key].stages.expected.dryRun).toBe(true);
  });
});
