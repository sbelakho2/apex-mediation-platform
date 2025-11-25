import { redactLogInfo } from '../../utils/logger';

describe('VRA Controllers — RBAC/logs extended spot-checks', () => {
  it('masks reason_code on controller/service log payloads (top-level and nested)', () => {
    const before = {
      level: 'warn',
      message: 'controller emitted a delta with reason code containing ops@example.com and Bearer token',
      reason_code: 'ops@example.com Bearer abc.def.ghi 4242424242424242',
      meta: {
        reason_code: 'sk_test_foo 4111111111111111',
      },
    } as any;

    const out = redactLogInfo({ ...before });

    // Top-level message is redacted but we specifically assert structured masking on reason_code fields
    expect(out.reason_code).toBe('[REDACTED]');
    expect((out as any).meta.reason_code).toBe('[REDACTED]');
  });
});
