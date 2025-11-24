import { redactLogInfo } from '../../../utils/logger';

describe('Proofs — logs redaction safety', () => {
  it('masks signatures, digests, and hashes; redacts emails/tokens in messages', () => {
    const before = {
      level: 'error',
      message: 'proof verify failed for ops@example.com with token Bearer s3cr3t and digest 1234abcd',
      proof: {
        month: '2025-11',
        digest: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
        signature: 'ed25519sigdeadbeef',
        prev_hash: '00112233445566778899aabbccddeeff',
        hash: 'ffeeddccbbaa99887766554433221100',
      },
    } as any;

    const out = redactLogInfo({ ...before });
    // Emails and bearer redacted in message
    expect(String(out.message)).toContain('[REDACTED_EMAIL]');
    expect(String(out.message)).toContain('Bearer [REDACTED]');
    // Structured crypto fields masked entirely
    expect((out as any).proof.digest).toBe('[REDACTED]');
    expect((out as any).proof.signature).toBe('[REDACTED]');
    expect((out as any).proof.prev_hash).toBe('[REDACTED]');
    expect((out as any).proof.hash).toBe('[REDACTED]');
  });
});
