import { redactString } from '../redaction';

describe('VRA redaction utility', () => {
  it('redacts emails', () => {
    const out = redactString('contact alice@example.com now');
    expect(out).toContain('[REDACTED_EMAIL]');
    expect(out).not.toContain('alice@example.com');
  });

  it('redacts bearer tokens', () => {
    const out = redactString('token: Bearer abc.def.ghi');
    expect(out).toContain('Bearer [REDACTED]');
    expect(out).not.toContain('abc.def.ghi');
  });

  it('redacts stripe keys', () => {
    const out = redactString('sk_test_12345 sk_live_abc');
    expect(out).toContain('sk_test_[REDACTED]');
    expect(out).toContain('sk_live_[REDACTED]');
  });

  it('redacts long numeric sequences 13-19 digits', () => {
    const out = redactString('digits 4242424242424242 in text');
    expect(out).toContain('[REDACTED_NUMERIC]');
  });
});
