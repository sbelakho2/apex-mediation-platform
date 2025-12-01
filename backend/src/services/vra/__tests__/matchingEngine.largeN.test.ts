import { matchStatementsToExpected, StatementRowLite, ExpectedRowLite } from '../matchingEngine';
import { vraMatchCandidatesTotal, vraMatchAutoTotal, vraMatchReviewTotal, vraMatchUnmatchedTotal } from '../../../utils/prometheus';

/**
 * Large-N performance sanity test (mocked data, no external deps)
 *
 * Goals:
 * - Ensure the matching engine scales plausibly on synthetic datasets.
 * - Verify Prometheus counters increase and that output partitioning is consistent.
 * - Keep CI budget modest by default (N≈400, M≈450); allow larger run via env VRA_LARGEN=1.
 */

describe('VRA Matching Engine — large-N performance sanity', () => {
  const isLarge = process.env.VRA_LARGEN === '1';
  const N = isLarge ? 2000 : 400; // statements
  const M = isLarge ? 2200 : 450; // expected

  // Deterministic-ish pseudo-random generator
  let seed = 1337;
  function rnd(): number {
    // xorshift32
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return ((seed >>> 0) % 100000) / 100000; // [0,1)
  }

  function genData() {
    const statements: StatementRowLite[] = [];
    const expected: ExpectedRowLite[] = [];

    const baseDate = '2025-11-01';
    const appId = 'app-demo';
    const unit = 'unit-A';
    const country = 'US';
    const format = 'interstitial';

    for (let i = 0; i < N; i++) {
      const paid = 1 + rnd() * 9; // 1..10 USD
      statements.push({
        statementId: `s${i}`,
        eventDate: baseDate,
        appId,
        adUnitId: unit,
        country,
        format,
        paidUsd: Number(paid.toFixed(3)),
      });
    }

    for (let j = 0; j < M; j++) {
      const tsSec = 12 * 3600 + Math.floor((rnd() - 0.5) * 300); // around noon ±2.5m
      const hh = String(Math.floor(tsSec / 3600)).padStart(2, '0');
      const mm = String(Math.floor((tsSec % 3600) / 60)).padStart(2, '0');
      const ss = String(tsSec % 60).padStart(2, '0');
      const amt = 1 + rnd() * 9;
      expected.push({
        requestId: `r${j}`,
        ts: `${baseDate}T${hh}:${mm}:${ss}Z`,
        expectedUsd: Number(amt.toFixed(3)),
        appIdHint: appId,
        adUnitIdHint: unit,
        countryHint: country,
        formatHint: format,
      });
    }

    return { statements, expected };
  }

  it('produces partitioned outputs and increments counters under budget', () => {
    const { statements, expected } = genData();

    const candSpy = jest.spyOn(vraMatchCandidatesTotal, 'inc');
    const autoSpy = jest.spyOn(vraMatchAutoTotal, 'inc');
    const reviewSpy = jest.spyOn(vraMatchReviewTotal, 'inc');
    const unmatchedSpy = jest.spyOn(vraMatchUnmatchedTotal, 'inc');

    try {
      const out = matchStatementsToExpected(statements, expected, {
        autoAcceptThreshold: 0.8,
        reviewMinThreshold: 0.5,
        wTime: 0.6,
        wAmount: 0.25,
        wUnit: 0.15,
        timeWindowSec: 5 * 60,
      });

      // Basic partition sanity
      expect(out.auto.length + out.review.length + out.unmatched.length).toBe(N);

      // Counters should fire alongside output partitions
      expect(candSpy).toHaveBeenCalled();
      expect(autoSpy).toHaveBeenCalledTimes(out.auto.length);
      expect(reviewSpy).toHaveBeenCalledTimes(out.review.length);
      if (out.unmatched.length > 0) {
        expect(unmatchedSpy).toHaveBeenCalledWith(out.unmatched.length);
      } else {
        expect(unmatchedSpy).not.toHaveBeenCalled();
      }
    } finally {
      candSpy.mockRestore();
      autoSpy.mockRestore();
      reviewSpy.mockRestore();
      unmatchedSpy.mockRestore();
    }

    // Keep a very loose upper bound to catch accidental blow-ups when VRA_LARGEN is off
    // We don't assert runtime directly, relying on Jest default timeout; this acts as a guardrail.
  });
});
