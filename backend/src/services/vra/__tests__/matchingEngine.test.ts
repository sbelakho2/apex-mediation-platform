import { scoreCandidate, matchStatementsToExpected, StatementRowLite, ExpectedRowLite } from '../matchingEngine';

describe('VRA Matching Engine (library)', () => {
  const stmtBase: StatementRowLite = {
    statementId: 's1',
    eventDate: '2025-11-01',
    appId: 'com.app.demo',
    adUnitId: 'unit-1',
    country: 'US',
    format: 'interstitial',
    paidUsd: 10.0,
  };

  const expBase: ExpectedRowLite = {
    requestId: 'r1',
    ts: '2025-11-01T12:00:00Z',
    expectedUsd: 10.0,
    appIdHint: 'com.app.demo',
    adUnitIdHint: 'unit-1',
    countryHint: 'US',
    formatHint: 'interstitial',
  };

  it('scoreCandidate ~0.8+ for perfect time and amount with no unit hints', () => {
    const stmt = { ...stmtBase };
    const exp = { requestId: 'rX', ts: '2025-11-01T12:00:00Z', expectedUsd: 10.0 } as ExpectedRowLite;
    const s = scoreCandidate(stmt, exp);
    expect(s).toBeGreaterThanOrEqual(0.79);
  });

  it('scoreCandidate approaches 1.0 when unit hints all agree', () => {
    const s = scoreCandidate(stmtBase, expBase);
    expect(s).toBeGreaterThan(0.95);
  });

  it('matchStatementsToExpected auto-accepts high-confidence match', () => {
    const out = matchStatementsToExpected([stmtBase], [expBase]);
    expect(out.auto).toHaveLength(1);
    expect(out.review).toHaveLength(0);
    expect(out.unmatched).toHaveLength(0);
    expect(out.auto[0]).toMatchObject({ statementId: 's1', requestId: 'r1' });
    expect(out.auto[0].confidence).toBeGreaterThanOrEqual(0.8);
  });

  it('exact-key path short-circuits with confidence 1.0 and keys_used="exact"', () => {
    const stmt: StatementRowLite = {
      ...stmtBase,
      statementId: 's-exact',
      requestId: 'r-exact',
    };
    const exp: ExpectedRowLite = {
      requestId: 'r-exact',
      ts: '2025-11-01T00:00:01Z',
      expectedUsd: 5.0,
    };
    const out = matchStatementsToExpected([stmt], [exp]);
    expect(out.auto).toHaveLength(1);
    expect(out.auto[0].requestId).toBe('r-exact');
    expect(out.auto[0].confidence).toBe(1.0);
    expect(out.auto[0].keysUsed).toBe('exact');
  });

  it('matchStatementsToExpected sends mid-confidence to review', () => {
    const exp = { ...expBase, expectedUsd: 2.0 }; // amount far off lowers score
    const out = matchStatementsToExpected([stmtBase], [exp]);
    expect(out.auto).toHaveLength(0);
    expect(out.review.length + out.unmatched.length).toBe(1);
    // Allow either review or unmatched depending on weight config; assert confidence band when review present
    if (out.review.length === 1) {
      expect(out.review[0].confidence).toBeGreaterThanOrEqual(0.5);
      expect(out.review[0].confidence).toBeLessThan(0.8);
    }
  });

  it('matchStatementsToExpected leaves unmatched when outside time window and no unit hints', () => {
    const stmt = { ...stmtBase, paidUsd: 1.0 };
    const exp = { requestId: 'r2', ts: '2025-11-02T23:59:59Z', expectedUsd: 99.0 } as ExpectedRowLite; // different day end, amount off
    const out = matchStatementsToExpected([stmt], [exp], { timeWindowSec: 60 }); // very tight window
    expect(out.auto).toHaveLength(0);
    expect(out.review).toHaveLength(0);
    expect(out.unmatched).toHaveLength(1);
    expect(out.unmatched[0].statementId).toBe('s1');
  });
});
