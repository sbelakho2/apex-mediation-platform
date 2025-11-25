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

  it('exits with ERROR (20) when required --from/--to are missing', async () => {
    process.argv = [process.execPath, scriptPath];

    const exitSpy = jest
      .spyOn(process, 'exit')
      .mockImplementation(((code?: number) => {
        throw new Error(`EXIT ${code}`);
      }) as any);

    try {
      await import(scriptPath);
      throw new Error('should have exited');
    } catch (e: any) {
      expect(String(e.message)).toBe('EXIT 20');
    } finally {
      exitSpy.mockRestore();
    }
  });

  it('exits with ERROR (20) when --step is invalid', async () => {
    process.argv = [
      process.execPath,
      scriptPath,
      '--from', '2025-11-01T00:00:00Z',
      '--to', '2025-11-02T00:00:00Z',
      '--step', 'not-a-stage',
    ];

    const exitSpy = jest
      .spyOn(process, 'exit')
      .mockImplementation(((code?: number) => {
        throw new Error(`EXIT ${code}`);
      }) as any);

    try {
      await import(scriptPath);
      throw new Error('should have exited');
    } catch (e: any) {
      expect(String(e.message)).toBe('EXIT 20');
    } finally {
      exitSpy.mockRestore();
    }
  });
});
