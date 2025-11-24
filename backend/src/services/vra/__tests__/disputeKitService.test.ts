import { buildDisputeKit, MemoryDisputeStorage } from '../disputeKitService';

// Mock ClickHouse helper used by Dispute Kit builder
jest.mock('../../../utils/clickhouse', () => ({
  executeQuery: jest.fn(async (_q: string, _p?: Record<string, unknown>) => [
    {
      kind: 'underpay',
      amount: '12.340000',
      currency: 'USD',
      // Intentionally include PII-like content to verify redaction
      reason_code: 'contact: alice@example.com, token: Bearer abc.def.ghi, digits: 4242424242424242',
      window_start: '2025-11-01 00:00:00',
      window_end: '2025-11-02 00:00:00',
      evidence_id: 'ev1',
      confidence: '0.91',
    },
  ]),
}));

const { executeQuery } = jest.requireMock('../../../utils/clickhouse');

describe('VRA Dispute Kit Builder', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns preview in dry-run with redacted CSV first lines', async () => {
    const out = await buildDisputeKit(['ev1'], { network: 'unity', dryRun: true });
    expect(out.storageUri).toBe('shadow://not-written');
    expect(out.preview).toBeDefined();
    const lines = out.preview!.evidenceCsvFirstLines.join('\n');
    expect(lines).toContain('underpay');
    // Redactions applied
    expect(lines).toContain('[REDACTED_EMAIL]');
    expect(lines).toContain('Bearer [REDACTED]');
    expect(lines).toContain('[REDACTED_NUMERIC]');
  });

  it('persists kit bundle via storage and returns mem:// URI', async () => {
    const storage = new MemoryDisputeStorage();
    const out = await buildDisputeKit(['ev1'], { network: 'unity', dryRun: false, storage });
    expect(out.storageUri.startsWith('mem://vra/')).toBe(true);
    // Extract key and verify stored content exists and is JSON
    const encodedKey = out.storageUri.split('/vra/')[1];
    expect(encodedKey).toBeTruthy();
    const key = decodeURIComponent(encodedKey);
    const buf = (storage as any).get(key);
    expect(buf).toBeInstanceOf(Buffer);
    const json = JSON.parse(buf.toString('utf8'));
    expect(json).toHaveProperty('metadata');
    expect(json).toHaveProperty('files');
    expect(json.files).toHaveProperty('evidence.csv');
    // Ensure CSV content is redacted
    expect(String(json.files['evidence.csv'])).toContain('[REDACTED_EMAIL]');
    expect(String(json.files['evidence.csv'])).toContain('Bearer [REDACTED]');
  });
});
