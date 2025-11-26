const { spawnSync } = require('child_process');
const path = require('path');

describe('Repository-wide provider content guard', () => {
  test('tools/content-guard.js exits 0 (no offenders)', () => {
    const script = path.resolve(__dirname, '../../../tools/content-guard.js');
    const res = spawnSync('node', [script], { encoding: 'utf8' });
    if (res.status !== 0) {
      console.error(res.stdout || '');
      console.error(res.stderr || '');
    }
    expect(res.status).toBe(0);
  });
});
