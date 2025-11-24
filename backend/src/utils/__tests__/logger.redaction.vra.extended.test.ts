import { redactLogInfo } from '../logger';

describe('logger redactLogInfo — extended VRA scenarios', () => {
  it('redacts nested sensitive fields and bearer tokens inside metadata', () => {
    const before = {
      message: 'creating dispute kit for contact jane.doe@example.com with token Bearer secret.jwt.token',
      meta: {
        contact: 'john@example.com',
        headers: { authorization: 'Bearer top.secret' },
        numbers: 'card 4242424242424242',
      },
    } as any;

    const out = redactLogInfo({ ...before });
    // Message should be redacted for email and bearer content
    expect(String(out.message)).toContain('[REDACTED_EMAIL]');
    expect(String(out.message)).toContain('Bearer [REDACTED]');
    // Nested sensitive keys are masked or redacted strings applied
    expect((out as any).meta.headers.authorization).toBe('[REDACTED]');
    expect(String((out as any).meta.contact)).toContain('[REDACTED_EMAIL]');
    expect(String((out as any).meta.numbers)).toContain('[REDACTED_NUMERIC]');
  });
});
