import { redactLogInfo } from '../../../utils/logger';

describe('Dispute Kit — logs redaction safety', () => {
  it('masks digest/signature/hash and redacts emails/tokens in error-path logs', () => {
    const before = {
      level: 'error',
      message: 'dispute kit build failed for contact ops@example.com with Bearer very.secret value',
      kit: {
        network: 'unity',
        contact: 'jane.doe@example.com',
        evidence: {
          digest: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
          signature: 'ed25519sigdeadbeef',
          hash: '00112233445566778899aabbccddeeff',
        },
      },
    } as any;

    const out = redactLogInfo({ ...before });

    // Email and bearer must be redacted in message
    expect(String(out.message)).toContain('[REDACTED_EMAIL]');
    expect(String(out.message)).toContain('Bearer [REDACTED]');
    // Structured crypto fields fully masked
    expect((out as any).kit.evidence.digest).toBe('[REDACTED]');
    expect((out as any).kit.evidence.signature).toBe('[REDACTED]');
    expect((out as any).kit.evidence.hash).toBe('[REDACTED]');
    // Nested contact string should be redacted, not removed entirely
    expect(String((out as any).kit.contact)).toContain('[REDACTED_EMAIL]');
  });
});
