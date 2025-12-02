import * as path from 'node:path';

describe('vraBackfill.js — invalid combo guardrails', () => {
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

  it('exits with ERROR (20) when --force is provided without --yes', async () => {
    process.argv = [
      process.execPath,
      scriptPath,
      '--from', '2025-11-01T00:00:00Z',
      '--to', '2025-11-02T00:00:00Z',
      '--step', 'expected',
      '--force', 'true',
      // missing --yes
    ];

    const exitSpy = jest
      .spyOn(process, 'exit')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .mockImplementation(((code?: number) => { throw new Error(`EXIT ${code ?? 0}`); }) as any);

    try {
      await runCli();
      throw new Error('expected process.exit');
    } catch (e: any) {
      expect(String(e.message)).toBe('EXIT 20');
    } finally {
      exitSpy.mockRestore();
    }
  });

  it('exits with ERROR (20) when --limit is negative or zero at orchestrator level', async () => {
    // negative limit
    process.argv = [
      process.execPath,
      scriptPath,
      '--from', '2025-11-01T00:00:00Z',
      '--to', '2025-11-02T00:00:00Z',
      '--step', 'expected',
      '--limit', '-5',
    ];

    const exitSpy = jest
      .spyOn(process, 'exit')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .mockImplementation(((code?: number) => { throw new Error(`EXIT ${code ?? 0}`); }) as any);

    try {
      await runCli();
      throw new Error('expected process.exit');
    } catch (e: any) {
      expect(String(e.message)).toBe('EXIT 20');
    } finally {
      exitSpy.mockRestore();
    }

    // zero limit
    jest.resetModules();
    process.argv = [
      process.execPath,
      scriptPath,
      '--from', '2025-11-01T00:00:00Z',
      '--to', '2025-11-02T00:00:00Z',
      '--step', 'expected',
      '--limit', '0',
    ];

    const exitSpy2 = jest
      .spyOn(process, 'exit')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .mockImplementation(((code?: number) => { throw new Error(`EXIT2 ${code ?? 0}`); }) as any);

    try {
      await runCli();
      throw new Error('expected process.exit');
    } catch (e: any) {
      expect(String(e.message)).toBe('EXIT2 20');
    } finally {
      exitSpy2.mockRestore();
    }
  });
});
