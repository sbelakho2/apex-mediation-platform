import * as path from 'node:path';

describe('vraIssueProofs.js — guardrails and behaviors', () => {
  const scriptPath = path.resolve(__dirname, '..', 'vraIssueProofs.js');

  const originalArgv = process.argv.slice();

  beforeEach(() => {
    jest.resetModules();
    process.argv = originalArgv.slice(0, 2);
  });

  afterAll(() => {
    process.argv = originalArgv;
  });

  function mockDeps({ hasExisting = false } = {}) {
    // Mock ClickHouse utils
    jest.doMock('../src/utils/clickhouse', () => ({
      initializeClickHouse: jest.fn(async () => {}),
      closeClickHouse: jest.fn(async () => {}),
      executeQuery: jest.fn(async () => (hasExisting ? [{ month: '2025-11', digest: 'old' }] : [])),
      insertBatch: jest.fn(async () => {}),
    }), { virtual: true });
  }

  it('rejects invalid --month → EXIT 20', async () => {
    mockDeps();
    process.argv = [process.execPath, scriptPath, '--month', '202511'];
    await expect(import(scriptPath)).rejects.toThrow('process.exit called with "20"');
  });

  it('dry-run path exits 10 (WARNINGS)', async () => {
    mockDeps();
    process.argv = [process.execPath, scriptPath, '--month', '2025-11', '--dry-run', 'true'];
    await expect(import(scriptPath)).rejects.toThrow('process.exit called with "10"');
  });

  it('create new month digest exits 0', async () => {
    mockDeps({ hasExisting: false });
    process.argv = [process.execPath, scriptPath, '--month', '2025-11'];
    await expect(import(scriptPath)).rejects.toThrow('process.exit called with "0"');
  });

  it('update existing month digest exits 0', async () => {
    mockDeps({ hasExisting: true });
    process.argv = [process.execPath, scriptPath, '--month', '2025-11'];
    await expect(import(scriptPath)).rejects.toThrow('process.exit called with "0"');
  });

  it('ClickHouse init failure → EXIT 20', async () => {
    // Override init to throw
    jest.doMock('../src/utils/clickhouse', () => ({
      initializeClickHouse: jest.fn(async () => { throw new Error('boom'); }),
      closeClickHouse: jest.fn(async () => {}),
      executeQuery: jest.fn(async () => []),
      insertBatch: jest.fn(async () => {}),
    }), { virtual: true });

    process.argv = [process.execPath, scriptPath, '--month', '2025-11'];
    await expect(import(scriptPath)).rejects.toThrow('process.exit called with "20"');
  });
});
