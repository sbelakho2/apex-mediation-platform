import * as path from 'node:path';

describe('vraBackfill.js — flag forwarding to stage CLIs', () => {
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

  function setupSpawnCapture() {
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
    return seen;
  }

  async function runCli() {
    const imported = await import(scriptPath);
    const mod = imported as { main?: () => Promise<void>; default?: { main?: () => Promise<void> } };
    const invoke = mod.main || mod.default?.main;
    if (!invoke) throw new Error('CLI main export not found');
    await invoke();
  }

  async function expectExit(code: number) {
    const exitSpy = jest
      .spyOn(process, 'exit')
      .mockImplementation(((exitCode?: number) => { throw new Error(`EXIT ${exitCode ?? 0}`); }) as any);

    try {
      await runCli();
      throw new Error('expected process.exit');
    } catch (e: any) {
      expect(String(e?.message ?? '')).toBe(`EXIT ${code}`);
    } finally {
      exitSpy.mockRestore();
    }
  }

  it('forwards --dry-run to expected stage (vraBuildExpected.js)', async () => {
    const seen = setupSpawnCapture();
    const checkpoint = path.resolve(process.cwd(), 'logs', `vra-forwarding-expected-${Date.now()}-${Math.random()}.json`);

    process.argv = [
      process.execPath,
      scriptPath,
      '--from', '2025-11-01T00:00:00Z',
      '--to', '2025-11-02T00:00:00Z',
      '--step', 'expected',
      '--dry-run', 'true',
      '--checkpoint', checkpoint,
    ];

    await expectExit(0);

    const call = seen.find((c) => c[1]?.endsWith('vraBuildExpected.js')) || [];
    expect(call.length).toBeGreaterThan(0);
    const args = call.slice(2);
    expect(args).toContain('--from');
    expect(args).toContain('2025-11-01T00:00:00Z');
    expect(args).toContain('--to');
    expect(args).toContain('2025-11-02T00:00:00Z');
    expect(args).toContain('--dry-run');
  });

  it('forwards --dry-run to reconcile stage (vraReconcile.js)', async () => {
    const seen = setupSpawnCapture();
    const checkpoint = path.resolve(process.cwd(), 'logs', `vra-forwarding-reconcile-${Date.now()}-${Math.random()}.json`);

    process.argv = [
      process.execPath,
      scriptPath,
      '--from', '2025-11-03T00:00:00Z',
      '--to', '2025-11-04T00:00:00Z',
      '--step', 'reconcile',
      '--dry-run', 'true',
      '--checkpoint', checkpoint,
    ];

    await expectExit(0);

    const call = seen.find((c) => c[1]?.endsWith('vraReconcile.js')) || [];
    expect(call.length).toBeGreaterThan(0);
    const args = call.slice(2);
    expect(args).toContain('--from');
    expect(args).toContain('2025-11-03T00:00:00Z');
    expect(args).toContain('--to');
    expect(args).toContain('2025-11-04T00:00:00Z');
    expect(args).toContain('--dry-run');
  });
});
