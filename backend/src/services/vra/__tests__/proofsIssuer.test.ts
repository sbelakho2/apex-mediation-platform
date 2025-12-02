import { computeMerkleRoot, sha256Hex, issueDailyRoot, issueMonthlyDigest, verifyMonthlyDigest } from '../proofsIssuer';

// Mock Postgres helpers used by proofs issuer
jest.mock('../../../utils/postgres', () => ({
  query: jest.fn(async () => ({ rows: [] })),
  insertMany: jest.fn(async () => {}),
}));

const { query, insertMany } = jest.requireMock('../../../utils/postgres');

describe('VRA Proofs Issuer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.PROOFS_SIGNING_PRIVATE_KEY;
    delete process.env.PROOFS_SIGNING_PUBLIC_KEY;
  });

  it('computeMerkleRoot is deterministic and handles empty set', () => {
    const h1 = sha256Hex('a');
    const h2 = sha256Hex('b');
    const root1 = computeMerkleRoot([h1, h2]);
    const root2 = computeMerkleRoot([h1, h2]);
    expect(root1).toBe(root2);
    const emptyRoot = computeMerkleRoot([]);
    expect(emptyRoot).toHaveLength(64);
  });

  it('issueDailyRoot (dry-run) computes root from receipts using request_id fallback', async () => {
    (query as jest.Mock).mockResolvedValueOnce({
      rows: [
        { request_id: 'r1', receipt_hash: undefined },
        { request_id: 'r2', receipt_hash: undefined },
      ],
    });
    const out = await issueDailyRoot('2025-11-01', { dryRun: true });
    expect(out.written).toBe(false);
    expect(out.root).toHaveLength(64);
    expect(out.coveragePct).toBeGreaterThan(0);
    expect(insertMany).not.toHaveBeenCalled();
  });

  it('issueMonthlyDigest (dry-run) computes digest from daily roots', async () => {
    // First and only CH call in issueMonthlyDigest: select daily roots for month
    (query as jest.Mock).mockResolvedValueOnce({
      rows: [
        { day: '2025-11-01', merkle_root: sha256Hex('d1') },
        { day: '2025-11-02', merkle_root: sha256Hex('d2') },
      ],
    });
    const out = await issueMonthlyDigest('2025-11', { dryRun: true });
    expect(out.written).toBe(false);
    expect(out.digest).toHaveLength(64);
    expect(insertMany).not.toHaveBeenCalled();
  });

  it('verifyMonthlyDigest detects digest mismatch and missing/invalid signature', async () => {
    const digestGood = computeMerkleRoot([sha256Hex('d1'), sha256Hex('d2')]);
    // First query: proofs_monthly_digest row
    (query as jest.Mock)
      .mockResolvedValueOnce({ rows: [{ month: '2025-11', digest: 'deadbeef', sig: '' }] })
      // Second query: daily roots used to recompute
      .mockResolvedValueOnce({
        rows: [
          { day: '2025-11-01', merkle_root: sha256Hex('d1') },
          { day: '2025-11-02', merkle_root: sha256Hex('d2') },
        ],
      });
    const fail = await verifyMonthlyDigest('2025-11');
    expect(fail.ok).toBe(false);
    expect(fail.reason).toBe('digest_mismatch');

    // Now match digest but signature missing -> signature_invalid_or_missing
    (query as jest.Mock)
      .mockResolvedValueOnce({ rows: [{ month: '2025-11', digest: digestGood, sig: '' }] })
      .mockResolvedValueOnce({
        rows: [
          { day: '2025-11-01', merkle_root: sha256Hex('d1') },
          { day: '2025-11-02', merkle_root: sha256Hex('d2') },
        ],
      });
    const sigMissing = await verifyMonthlyDigest('2025-11');
    expect(sigMissing.ok).toBe(false);
    expect(sigMissing.reason).toBe('signature_invalid_or_missing');
  });

  it('verifyMonthlyDigest succeeds when digest matches and signature verifies', async () => {
    // Generate an Ed25519 keypair for the test and set env keys
    const crypto = require('node:crypto');
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
    process.env.PROOFS_SIGNING_PUBLIC_KEY = publicKey.export({ type: 'spki', format: 'pem' }).toString();
    process.env.PROOFS_SIGNING_PRIVATE_KEY = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();

    // Construct daily roots and compute digest identical to issuer logic
    const daily = [sha256Hex('d1'), sha256Hex('d2')];
    const digest = computeMerkleRoot(daily);
    const month = '2025-11';
    const msgHex = sha256Hex(Buffer.from(`monthly_digest:${month}:${digest}`));
    const sig = crypto.sign(null, Buffer.from(msgHex, 'hex'), privateKey).toString('hex');

    // Mock Postgres read-model queries:
    // 1) Fetch monthly digest row (provide digest + sig)
    // 2) Fetch daily roots for recompute
    (query as jest.Mock)
      .mockResolvedValueOnce({ rows: [{ month, digest, sig }] })
      .mockResolvedValueOnce({
        rows: [
          { day: '2025-11-01', merkle_root: daily[0] },
          { day: '2025-11-02', merkle_root: daily[1] },
        ],
      });

    const ok = await verifyMonthlyDigest(month);
    expect(ok.ok).toBe(true);
  });
});
