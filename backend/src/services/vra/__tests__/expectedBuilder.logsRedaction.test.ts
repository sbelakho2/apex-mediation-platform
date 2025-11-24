import { redactLogInfo } from '../../../utils/logger';

describe('Expected Builder — logs redaction safety', () => {
  it('redacts emails, tokens, JWT-like strings and long hex in warning/error payloads', () => {
    const before = {
      level: 'warn',
      message: 'expectedBuilder: contact ops@example.com failed with Bearer secret.token value eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.abc.def',
      // simulate structured fields that a builder might include
      requestId: 'req-123',
      meta: {
        access_token: 'xyz.abc.123',
        id_token: 'eyJabc.eyJ123.sig',
        receipt: {
          digest: 'a3b2c1d4e5f60718293a4b5c6d7e8f901234567890abcdef1234567890abcdef',
          signature: '9f8e7d6c5b4a',
        },
      },
    } as any;

    const out = redactLogInfo({ ...before });
    // Emails are redacted
    expect(String(out.message)).toContain('[REDACTED_EMAIL]');
    // Bearer token redacted
    expect(String(out.message)).toContain('Bearer [REDACTED]');
    // JWT-like strings redacted in message
    expect(String(out.message)).toContain('[REDACTED_JWT]');
    // Sensitive keys masked entirely
    expect((out as any).meta.access_token).toBe('[REDACTED]');
    expect((out as any).meta.id_token).toBe('[REDACTED]');
    // Crypto-related fields masked
    expect((out as any).meta.receipt.digest).toBe('[REDACTED]');
    expect((out as any).meta.receipt.signature).toBe('[REDACTED]');
  });
});
