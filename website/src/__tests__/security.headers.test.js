/**
 * Security headers test (no running server required).
 * Imports next.config.js and asserts configured headers and values.
 */
// CommonJS import of Next config
// eslint-disable-next-line @typescript-eslint/no-var-requires
const nextConfig = require('../../next.config.js');

function toMap(headers) {
  const map = {};
  for (const h of headers) {
    map[String(h.key || '').toLowerCase()] = String(h.value || '');
  }
  return map;
}

describe('Website Security Headers (config)', () => {
  it('defines strict security headers on all routes', async () => {
    const rules = await nextConfig.headers();
    const all = rules.find((r) => r.source === '/:path*');
    expect(all).toBeTruthy();
    const map = toMap(all.headers || []);

    expect(map['x-dns-prefetch-control']).toBe('on');
    expect(map['strict-transport-security']).toBe('max-age=63072000; includeSubDomains; preload');
    expect(map['x-content-type-options']).toBe('nosniff');
    expect(map['x-frame-options']).toBe('DENY');
    expect(map['referrer-policy']).toBe('strict-origin-when-cross-origin');
    expect(map['permissions-policy']).toContain('camera=()');

    const csp = map['content-security-policy'];
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("img-src 'self' data: https:");
    expect(csp).toContain("style-src 'self'");
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("connect-src 'self' https:");
    expect(csp).toContain("font-src 'self' data:");
  });
});
