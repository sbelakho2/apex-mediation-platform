import {
  vraMatchAutoTotal,
  vraMatchCandidatesTotal,
  vraMatchDurationSeconds,
  vraMatchReviewTotal,
  vraMatchUnmatchedTotal,
  vraMatchExactTotal,
} from '../../utils/prometheus';

export type StatementRowLite = {
  // Canonical statement keys (from recon_statements_norm)
  statementId: string; // deterministic id (e.g., hash of row) for idempotency at persistence layer
  eventDate: string; // YYYY-MM-DD
  appId: string;
  adUnitId: string;
  country: string; // ISO-3166-1 alpha-2
  format: string; // interstitial|rewarded|banner|video|native|VAST
  paidUsd?: number; // Optional: USD-normalized paid value for proximity scoring
  // Optional exact-match identifiers where available (network dependent)
  requestId?: string;
  impressionId?: string;
  clickId?: string;
  installId?: string;
};

export type ExpectedRowLite = {
  // From recon_expected (plus optional meta hints for fuzzy matching)
  requestId: string;
  ts: string; // ISO timestamp
  expectedUsd: number; // expected_value (USD)
  // Optional hints to improve matching quality (if available via side-channel)
  appIdHint?: string;
  adUnitIdHint?: string;
  countryHint?: string;
  formatHint?: string;
};

export type MatchResult = {
  statementId: string;
  requestId: string;
  confidence: number; // 0..1
  keysUsed: 'exact' | 'fuzzy';
  reasons?: { time?: number; amount?: number; unit?: number };
};

export type MatchingOptions = {
  // Confidence threshold knobs
  autoAcceptThreshold?: number; // default 0.8
  reviewMinThreshold?: number; // default 0.5
  // Scoring weights (should sum ≈ 1 but not strictly required)
  wTime?: number; // default 0.5
  wAmount?: number; // default 0.3
  wUnit?: number; // default 0.2 (unit/app/country/format agreement)
  // Time window in seconds for fuzzy candidate selection (best‑effort; callers decide fetching window)
  timeWindowSec?: number; // default 5 * 60 (±5 minutes)
};

const DEFAULTS: Required<MatchingOptions> = {
  autoAcceptThreshold: 0.8,
  reviewMinThreshold: 0.5,
  wTime: 0.5,
  wAmount: 0.3,
  wUnit: 0.2,
  timeWindowSec: 5 * 60,
};

// Helper: normalized absolute difference in seconds clamped to window
function timeProximityScore(stmtDateISO: string, expTsISO: string, windowSec: number): number {
  const stmtMid = Date.parse(stmtDateISO + 'T12:00:00Z'); // day‑level statements: use day center as a heuristic
  const expTs = Date.parse(expTsISO);
  if (!Number.isFinite(stmtMid) || !Number.isFinite(expTs)) return 0.0;
  const dt = Math.abs(expTs - stmtMid) / 1000; // seconds
  const clamped = Math.min(dt, windowSec);
  return 1.0 - clamped / windowSec; // 1 when within 0s of center, 0 at window edge
}

function amountProximityScore(paidUsd: number | undefined, expectedUsd: number): number {
  const paid = typeof paidUsd === 'number' && isFinite(paidUsd) ? paidUsd : undefined;
  if (!paid || expectedUsd <= 0) return 0.0;
  const relErr = Math.abs(paid - expectedUsd) / Math.max(expectedUsd, 1e-6);
  // Map relative error to [0,1] with a soft knee; 0% error → 1.0, 100% error → ~0
  const score = 1.0 / (1.0 + relErr * 4.0);
  return Math.max(0, Math.min(1, score));
}

function unitAgreementScore(stmt: StatementRowLite, exp: ExpectedRowLite): number {
  let agree = 0;
  let total = 0;
  if (exp.appIdHint) { total++; if (exp.appIdHint === stmt.appId) agree++; }
  if (exp.adUnitIdHint) { total++; if (exp.adUnitIdHint === stmt.adUnitId) agree++; }
  if (exp.countryHint) { total++; if (exp.countryHint === stmt.country) agree++; }
  if (exp.formatHint) { total++; if (exp.formatHint === stmt.format) agree++; }
  if (total === 0) return 0.0;
  return agree / total; // fraction of hint keys that agree
}

export function scoreCandidate(stmt: StatementRowLite, exp: ExpectedRowLite, opt?: MatchingOptions): number {
  const cfg = { ...DEFAULTS, ...(opt || {}) };
  const sTime = timeProximityScore(stmt.eventDate, exp.ts, cfg.timeWindowSec);
  const sAmt = amountProximityScore(stmt.paidUsd, exp.expectedUsd);
  const sUnit = unitAgreementScore(stmt, exp);
  const score = cfg.wTime * sTime + cfg.wAmount * sAmt + cfg.wUnit * sUnit;
  return Math.max(0, Math.min(1, score));
}

export function matchStatementsToExpected(
  statements: StatementRowLite[],
  expected: ExpectedRowLite[],
  options?: MatchingOptions
): { auto: MatchResult[]; review: MatchResult[]; unmatched: StatementRowLite[] } {
  const end = vraMatchDurationSeconds.startTimer();
  const cfg = { ...DEFAULTS, ...(options || {}) };

  const auto: MatchResult[] = [];
  const review: MatchResult[] = [];
  const unmatched: StatementRowLite[] = [];

  for (const stmt of statements) {
    // 0) Exact-key path (requestId short-circuit)
    if (stmt.requestId) {
      const expExact = expected.find((e) => e.requestId === stmt.requestId);
      if (expExact) {
        auto.push({ statementId: stmt.statementId, requestId: expExact.requestId, confidence: 1.0, keysUsed: 'exact' });
        try { vraMatchExactTotal.inc(); } catch {}
        continue;
      }
    }

    let best: { exp: ExpectedRowLite; score: number; reasons: { time: number; amount: number; unit: number } } | null = null;

    for (const exp of expected) {
      // Quick filter: ensure same day window heuristic (expected ts same calendar day as statement date)
      if (!exp.ts.startsWith(stmt.eventDate)) {
        // still allow if within window seconds (for late events crossing midnight)
        const prox = timeProximityScore(stmt.eventDate, exp.ts, cfg.timeWindowSec);
        if (prox <= 0) continue;
      }
      const sTime = timeProximityScore(stmt.eventDate, exp.ts, cfg.timeWindowSec);
      const sAmt = amountProximityScore(stmt.paidUsd, exp.expectedUsd);
      const sUnit = unitAgreementScore(stmt, exp);
      const score = cfg.wTime * sTime + cfg.wAmount * sAmt + cfg.wUnit * sUnit;
      vraMatchCandidatesTotal.inc();
      if (!best || score > best.score) best = { exp, score, reasons: { time: sTime, amount: sAmt, unit: sUnit } };
    }

    if (!best) {
      unmatched.push(stmt);
      continue;
    }

    const keysUsed: 'exact' | 'fuzzy' = 'fuzzy';
    if (best.score >= cfg.autoAcceptThreshold) {
      auto.push({ statementId: stmt.statementId, requestId: best.exp.requestId, confidence: best.score, keysUsed, reasons: best.reasons });
      vraMatchAutoTotal.inc();
    } else if (best.score >= cfg.reviewMinThreshold) {
      review.push({ statementId: stmt.statementId, requestId: best.exp.requestId, confidence: best.score, keysUsed, reasons: best.reasons });
      vraMatchReviewTotal.inc();
    } else {
      unmatched.push(stmt);
    }
  }

  if (unmatched.length > 0) {
    // increment as a lump sum (prom-client allows inc(N))
    try { vraMatchUnmatchedTotal.inc(unmatched.length); } catch {}
  }

  end();
  return { auto, review, unmatched };
}

export default {
  scoreCandidate,
  matchStatementsToExpected,
};
