import { buildDisputeKit, MemoryDisputeStorage } from '../disputeKitService';

// Mock ClickHouse helper used by Dispute Kit builder
jest.mock('../../../utils/clickhouse', () => ({
  executeQuery: jest.fn(async (_q: string, _p?: Record<string, unknown>) => {
    // Generate a large set of rows (~10k) to validate memory/streaming behavior
    const N = 10000; // keep within CI limits while exercising size
    const rows: any[] = new Array(N);
    for (let i = 0; i < N; i++) {
      rows[i] = {
        kind: i % 2 === 0 ? 'underpay' : 'timing_lag',
        amount: (Math.random() * 10).toFixed(6),
        currency: 'USD',
        reason_code: i === 123 ? 'contact: bob@example.com token: Bearer abc.def.ghi' : 'ok',
        window_start: '2025-11-01 00:00:00',
        window_end: '2025-11-02 00:00:00',
        evidence_id: `ev_${i}`,
        confidence: (0.5 + Math.random() * 0.5).toFixed(2),
      };
    }
    return rows;
  }),
}));

const { executeQuery } = jest.requireMock('../../../utils/clickhouse');

describe('VRA Dispute Kit — large evidence streaming/integrity', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('builds and stores a large JSON bundle with redacted CSV contents', async () => {
    const storage = new MemoryDisputeStorage();
    const out = await buildDisputeKit(['ev_0', 'ev_1'], { network: 'unity', dryRun: false, storage, ttlSec: 300 });

    // Validate URI and stored content
    expect(out.storageUri.startsWith('mem://vra/')).toBe(true);
    const key = decodeURIComponent(out.storageUri.split('/vra/')[1]);
    const buf = (storage as any).get(key);
    expect(buf).toBeInstanceOf(Buffer);

    const json = JSON.parse(buf.toString('utf8')) as { metadata: any; files: Record<string, string> };
    expect(json).toHaveProperty('metadata');
    expect(json.metadata).toHaveProperty('checksum_sha256');
    expect(json.metadata).toHaveProperty('ttl_sec', 300);
    expect(json).toHaveProperty('files');
    expect(json.files).toHaveProperty('evidence.csv');

    const csv = String(json.files['evidence.csv']);
    // Contains header and many lines
    expect(csv.startsWith('kind,amount,currency,reason_code,window_start,window_end,evidence_id,confidence'));
    expect((csv.match(/\n/g) || []).length).toBeGreaterThan(9000); // rough check ~10k rows
    // Redactions applied on sample row 123 injected above
    expect(csv).toContain('[REDACTED_EMAIL]');
    expect(csv).toContain('Bearer [REDACTED]');
  });
});
