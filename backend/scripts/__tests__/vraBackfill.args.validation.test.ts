import * as path from 'node:path';

describe('vraBackfill.js — argument validation and exit codes', () => {
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
      throw new Error('should have exited');
    } catch (e: any) {
      expect(String(e?.message ?? '')).toBe(`EXIT ${code}`);
    } finally {
      exitSpy.mockRestore();
    }
  }

  it('exits with ERROR (20) when required --from/--to are missing', async () => {
    process.argv = [process.execPath, scriptPath];

    await expectExit(20);
  });

  it('exits with ERROR (20) when --step is invalid', async () => {
    process.argv = [
      process.execPath,
      scriptPath,
      '--from', '2025-11-01T00:00:00Z',
      '--to', '2025-11-02T00:00:00Z',
      '--step', 'not-a-stage',
    ];

    await expectExit(20);
  });
});
