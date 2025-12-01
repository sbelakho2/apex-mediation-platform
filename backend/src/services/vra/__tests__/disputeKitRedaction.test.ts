import { buildDisputeKit, MemoryDisputeStorage } from '../disputeKitService';

// Mock Postgres helper used by Dispute Kit builder
jest.mock('../../../utils/postgres', () => ({
  query: jest.fn(async () => ({
    rows: [
      {
        kind: 'underpay',
        amount: '12.340000',
        currency: 'USD',
        // Include PII-like content to verify redaction paths
        reason_code: 'email: bob@example.com token Bearer abc.def.ghi digits 4242424242424242',
        window_start: '2025-11-01 00:00:00',
        window_end: '2025-11-02 00:00:00',
        evidence_id: 'ev-redact',
        confidence: '0.91',
      },
    ],
  })),
}));

describe('VRA Dispute Kit — redaction in CSV evidence', () => {
  it('redacts emails, bearer tokens, and long numerics in embedded CSV', async () => {
    const storage = new MemoryDisputeStorage();
    const out = await buildDisputeKit(['ev-redact'], { network: 'unity', dryRun: false, storage, ttlSec: 60 });
    const key = decodeURIComponent(out.storageUri.split('/vra/')[1]);
    const buf = (storage as any).get(key) as Buffer;
    const json = JSON.parse(buf.toString('utf8')) as { files: Record<string, string> };
    const csv = String(json.files['evidence.csv']);
    expect(csv).toContain('[REDACTED_EMAIL]');
    expect(csv).toContain('Bearer [REDACTED]');
    expect(csv).toContain('[REDACTED_NUMERIC]');
  });
});
