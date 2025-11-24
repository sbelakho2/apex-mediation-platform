import * as fs from 'node:fs';
import * as path from 'node:path';
import { FileSystemDisputeStorage } from '../disputeKitService';

describe('VRA Dispute Kit Storage — FileSystem adapter', () => {
  const baseDir = path.resolve(process.cwd(), 'logs', `vra-kits-test-${Date.now()}`);

  afterAll(() => {
    try {
      // Clean up test directory
      fs.rmSync(baseDir, { recursive: true, force: true });
    } catch {}
  });

  it('writes bundle to filesystem and returns a file:// URI', async () => {
    const storage = new FileSystemDisputeStorage(baseDir);
    const key = 'disputes/kit_test.json';
    const content = JSON.stringify({ hello: 'world', n: 42 });
    const uri = await storage.putObject(key, content, 'application/json', 60);

    expect(uri.startsWith('file://')).toBe(true);
    const filePath = uri.replace('file://', '');
    expect(fs.existsSync(filePath)).toBe(true);
    const read = fs.readFileSync(filePath, 'utf8');
    expect(JSON.parse(read)).toMatchObject({ hello: 'world', n: 42 });
  });
});
