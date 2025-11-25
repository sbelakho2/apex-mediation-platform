import { redactLogInfo } from '../../../../utils/logger';

describe('VRA Ingestion — logs redaction safety (ingestion warnings/errors)', () => {
  it('redacts emails, bearer/JWT tokens, stripe keys, long numerics inside nested ingestion metadata', () => {
    const before = {
      level: 'warn',
      message: [
        'ingestion warning for report ops@example.com',
        'Authorization: Bearer very.secret.token',
        'Embedded JWT eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.abc.def',
        'Stripe secret sk_live_51abcdEFghIJK',
        'Potential card 4242424242424242',
      ].join(' | '),
      // Typical structured metadata an ingestion warning/error might carry
      report: {
        network: 'unity',
        schema_ver: 1,
        headers: {
          authorization: 'Bearer top.secret',
          contact: 'jane.doe@example.com',
        },
        sample_row: 'email=foo@example.com&token=abc.def.ghi&id=4111111111111111',
      },
    } as any;

    const out = redactLogInfo({ ...before });
    // Message string redactions
    expect(String(out.message)).toContain('[REDACTED_EMAIL]');
    expect(String(out.message)).toContain('Bearer [REDACTED]');
    expect(String(out.message)).toContain('[REDACTED_JWT]');
    expect(String(out.message)).toContain('sk_live_[REDACTED]');
    expect(String(out.message)).toContain('[REDACTED_NUMERIC]');

    // Structured fields: sensitive keys masked entirely
    expect((out as any).report.headers.authorization).toBe('[REDACTED]');
    // Non-sensitive strings should have patterns redacted
    expect(String((out as any).report.headers.contact)).toContain('[REDACTED_EMAIL]');
    expect(String((out as any).report.sample_row)).toContain('[REDACTED_EMAIL]');
    expect(String((out as any).report.sample_row)).toContain('[REDACTED_NUMERIC]');
  });

  it('redacts URL-encoded and mixed-encoding payload fragments in ingestion samples', () => {
    const before = {
      level: 'warn',
      message: 'ingestion: malformed row for ops%40example.com with token=abc.def.ghi',
      sample: {
        // URL-encoded email and token, plus jwt-like segment without Bearer prefix
        qs: 'email=john.doe%40example.com&id_token=eyJabc.eyJ123.sig&n=4111111111111111',
        // Mixed UTF-8 content with diacritics should remain intact while secrets are redacted
        note: 'café – contact maria.garcía@example.com',
      },
    } as any;

    const out = redactLogInfo({ ...before });
    expect(String(out.message)).toContain('[REDACTED_EMAIL]');
    // JWT-like strings are redacted even without Bearer
    expect(String((out as any).sample.qs)).toContain('[REDACTED_JWT]');
    // Long numerics are scrubbed
    expect(String((out as any).sample.qs)).toContain('[REDACTED_NUMERIC]');
    // Email in mixed UTF-8 text is redacted but diacritics preserved
    expect(String((out as any).sample.note)).toContain('[REDACTED_EMAIL]');
    expect(String((out as any).sample.note)).toContain('café');
  });
});
