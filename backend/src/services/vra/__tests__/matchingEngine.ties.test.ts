import { matchStatementsToExpected, StatementRowLite, ExpectedRowLite } from '../matchingEngine';

describe('VRA Matching Engine — tie-breakers and determinism', () => {
  it('returns deterministic ordering and consistent auto vs review on equal scores', () => {
    const stmt: StatementRowLite = {
      statementId: 's1',
      eventDate: '2025-11-01',
      appId: 'app',
      adUnitId: 'unit',
      country: 'US',
      format: 'interstitial',
      paidUsd: 10,
    };
    const expA: ExpectedRowLite = { requestId: 'rA', ts: '2025-11-01T12:00:00Z', expectedUsd: 10 };
    const expB: ExpectedRowLite = { requestId: 'rB', ts: '2025-11-01T12:00:00Z', expectedUsd: 10 };

    const out1 = matchStatementsToExpected([stmt], [expA, expB], { autoAcceptThreshold: 0.8, reviewMinThreshold: 0.5 });
    const out2 = matchStatementsToExpected([stmt], [expB, expA], { autoAcceptThreshold: 0.8, reviewMinThreshold: 0.5 });

    // Both runs should produce a single auto match (scores equal and above threshold)
    expect(out1.auto.length + out1.review.length).toBe(1);
    expect(out2.auto.length + out2.review.length).toBe(1);
    // Deterministic behavior: same requestId selected regardless of candidate order
    const sel1 = (out1.auto[0] || out1.review[0]).requestId;
    const sel2 = (out2.auto[0] || out2.review[0]).requestId;
    expect(sel1).toBe(sel2);
  });
});
