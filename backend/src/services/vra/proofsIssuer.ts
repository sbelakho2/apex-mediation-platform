import crypto from 'node:crypto';
import logger from '../../utils/logger';
import { executeQuery, insertBatch } from '../../utils/clickhouse';
import { vraProofsCoveragePct, vraProofsIssuanceDurationSeconds, vraProofsVerifyFailuresTotal } from '../../utils/prometheus';

type CHExpectedRow = { receipt_hash?: string; request_id: string };
type CHDailyRootRow = { day: string; merkle_root: string };

export function sha256Hex(buf: Buffer | string): string {
  const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
  return crypto.createHash('sha256').update(b).digest('hex');
}

export function computeMerkleRoot(hashes: string[]): string {
  // Normalize: lowercase hex, filter invalid
  const clean = hashes
    .map((h) => String(h || '').trim().toLowerCase())
    .filter((h) => /^[0-9a-f]+$/.test(h));
  if (clean.length === 0) {
    // Root of empty set — define as sha256('') for determinism
    return sha256Hex('');
  }
  let layer = clean.slice().sort();
  while (layer.length > 1) {
    const next: string[] = [];
    if (layer.length % 2 === 1) {
      // duplicate last to make even
      layer.push(layer[layer.length - 1]);
    }
    for (let i = 0; i < layer.length; i += 2) {
      const left = Buffer.from(layer[i], 'hex');
      const right = Buffer.from(layer[i + 1], 'hex');
      const combined = Buffer.concat([left, right]);
      next.push(sha256Hex(combined));
    }
    layer = next;
  }
  return layer[0];
}

function tryEd25519SignHex(messageHex: string): string | null {
  const priv = process.env.PROOFS_SIGNING_PRIVATE_KEY;
  if (!priv) return null;
  try {
    const key = crypto.createPrivateKey(priv);
    const sig = crypto.sign(null, Buffer.from(messageHex, 'hex'), key);
    return sig.toString('hex');
  } catch (e) {
    logger.warn('VRA Proofs: signing failed, proceeding without signature', { error: (e as Error).message });
    return null;
  }
}

function tryEd25519VerifyHex(messageHex: string, signatureHex: string): boolean {
  const pub = process.env.PROOFS_SIGNING_PUBLIC_KEY;
  if (!pub) return false;
  try {
    const key = crypto.createPublicKey(pub);
    return crypto.verify(null, Buffer.from(messageHex, 'hex'), key, Buffer.from(signatureHex, 'hex'));
  } catch {
    return false;
  }
}

export async function issueDailyRoot(day: string, opts?: { dryRun?: boolean }): Promise<{ day: string; root: string; sig?: string; coveragePct: number; written: boolean }>
{
  const end = vraProofsIssuanceDurationSeconds.startTimer();
  const dryRun = opts?.dryRun === true;
  try {
    // Fetch all recon_expected rows for the given day
    const rows = await executeQuery<CHExpectedRow>(
      `SELECT receipt_hash, request_id FROM recon_expected WHERE toDate(ts) = toDate(parseDateTimeBestEffortOrZero({day:String}))`,
      { day }
    );
    const total = rows.length;
    // Convert to hashes — prefer receipt_hash, fallback to sha256(request_id)
    const hashes = rows.map((r) => (r.receipt_hash && /^[0-9a-fA-F]+$/.test(r.receipt_hash) ? r.receipt_hash : sha256Hex(r.request_id)));
    const included = hashes.length;
    const coveragePct = total > 0 ? (included / total) * 100 : 0;
    const root = computeMerkleRoot(hashes);
    const messageHex = sha256Hex(Buffer.from(`daily_root:${day}:${root}`));
    const sig = tryEd25519SignHex(messageHex) || '';

    try { vraProofsCoveragePct.set({ day }, Number(coveragePct.toFixed(2))); } catch {}

    if (!dryRun) {
      await insertBatch('proofs_daily_roots', [ { day, merkle_root: root, sig } ]);
    }
    end();
    return { day, root, sig, coveragePct, written: !dryRun };
  } catch (e) {
    end();
    logger.warn('VRA Proofs: failed to issue daily root', { day, error: (e as Error).message });
    return { day, root: sha256Hex(''), coveragePct: 0, written: false } as any;
  }
}

export async function issueMonthlyDigest(month: string, opts?: { dryRun?: boolean }): Promise<{ month: string; digest: string; sig?: string; coveragePct: number; written: boolean }>
{
  const end = vraProofsIssuanceDurationSeconds.startTimer();
  const dryRun = opts?.dryRun === true;
  try {
    const roots = await executeQuery<CHDailyRootRow>(
      `SELECT toString(day) AS day, merkle_root FROM proofs_daily_roots WHERE formatDateTime(day, '%Y-%m') = {month:String} ORDER BY day ASC`,
      { month }
    );
    const rootList = roots.map((r) => r.merkle_root);
    const digest = computeMerkleRoot(rootList);
    const coveragePct = roots.length > 0 ? 100 : 0; // simplistic until we track expected days
    const messageHex = sha256Hex(Buffer.from(`monthly_digest:${month}:${digest}`));
    const sig = tryEd25519SignHex(messageHex) || '';
    if (!dryRun) {
      await insertBatch('proofs_monthly_digest', [ { month, digest, sig, coverage_pct: Number(coveragePct.toFixed(2)), notes: '' } ]);
    }
    end();
    return { month, digest, sig, coveragePct, written: !dryRun };
  } catch (e) {
    end();
    logger.warn('VRA Proofs: failed to issue monthly digest', { month, error: (e as Error).message });
    return { month, digest: sha256Hex(''), coveragePct: 0, written: false } as any;
  }
}

export async function verifyMonthlyDigest(month: string): Promise<{ month: string; ok: boolean; reason?: string }>{
  try {
    // Fetch stored digest
    const rows = await executeQuery<{ month: string; digest: string; sig: string }>(
      `SELECT month, digest, sig FROM proofs_monthly_digest WHERE month = {month:String} LIMIT 1`,
      { month }
    );
    if (!rows.length) return { month, ok: false, reason: 'not_found' };
    const { digest, sig } = rows[0];
    // Recompute expected digest from daily roots
    const days = await executeQuery<CHDailyRootRow>(
      `SELECT toString(day) AS day, merkle_root FROM proofs_daily_roots WHERE formatDateTime(day, '%Y-%m') = {month:String} ORDER BY day ASC`,
      { month }
    );
    const recomputed = computeMerkleRoot(days.map((d) => d.merkle_root));
    if (recomputed !== digest) {
      vraProofsVerifyFailuresTotal.inc();
      return { month, ok: false, reason: 'digest_mismatch' };
    }
    const msgHex = sha256Hex(Buffer.from(`monthly_digest:${month}:${digest}`));
    const ok = tryEd25519VerifyHex(msgHex, sig || '') || false;
    if (!ok) {
      vraProofsVerifyFailuresTotal.inc();
      return { month, ok: false, reason: 'signature_invalid_or_missing' };
    }
    return { month, ok: true };
  } catch (e) {
    vraProofsVerifyFailuresTotal.inc();
    return { month, ok: false, reason: 'error' };
  }
}

export default {
  sha256Hex,
  computeMerkleRoot,
  issueDailyRoot,
  issueMonthlyDigest,
  verifyMonthlyDigest,
};
