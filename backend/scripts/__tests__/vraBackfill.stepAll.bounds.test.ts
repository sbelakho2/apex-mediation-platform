import * as path from 'node:path';

describe('vraBackfill.js — step=all requires bounds', () => {
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

  it('exits with ERROR (20) when --step all is provided without --from/--to', async () => {
    process.argv = [
      process.execPath,
      scriptPath,
      '--step', 'all',
      '--dry-run', 'true',
    ];

    const exitSpy = jest
      .spyOn(process, 'exit')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .mockImplementation(((code?: number) => { throw new Error(`EXIT ${code}`); }) as any);

    try {
      await import(scriptPath);
      throw new Error('expected process.exit');
    } catch (e: any) {
      expect(String(e.message)).toBe('EXIT 20');
    } finally {
      exitSpy.mockRestore();
    }
  });
});
