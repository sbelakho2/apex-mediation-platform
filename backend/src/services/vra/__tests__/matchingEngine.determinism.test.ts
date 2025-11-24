import { matchStatementsToExpected, StatementRowLite, ExpectedRowLite } from '../matchingEngine';

describe('VRA Matching Engine — determinism on fixed fixtures', () => {
  const statements: StatementRowLite[] = [
    {
      statementId: 's1',
      eventDate: '2025-11-01',
      appId: 'app1',
      adUnitId: 'unit1',
      country: 'US',
      format: 'interstitial',
      paidUsd: 10,
    },
    {
      statementId: 's2',
      eventDate: '2025-11-01',
      appId: 'app1',
      adUnitId: 'unit1',
      country: 'US',
      format: 'interstitial',
      paidUsd: 5,
    },
  ];

  const expected: ExpectedRowLite[] = [
    { requestId: 'r1', ts: '2025-11-01T11:59:59Z', expectedUsd: 10, appIdHint: 'app1', adUnitIdHint: 'unit1', countryHint: 'US', formatHint: 'interstitial' },
    { requestId: 'r2', ts: '2025-11-01T12:00:10Z', expectedUsd: 4.75, appIdHint: 'app1', adUnitIdHint: 'unit1', countryHint: 'US', formatHint: 'interstitial' },
  ];

  it('produces identical outputs across repeated runs', () => {
    const opts = { autoAcceptThreshold: 0.6, reviewMinThreshold: 0.3 };
    const out1 = matchStatementsToExpected(statements, expected, opts);
    const out2 = matchStatementsToExpected(statements, expected, opts);

    // Compare shapes
    expect(out1.auto.length).toBe(out2.auto.length);
    expect(out1.review.length).toBe(out2.review.length);
    expect(out1.unmatched.length).toBe(out2.unmatched.length);

    // Compare content deterministically (order and ids)
    const toKey = (o: ReturnType<typeof matchStatementsToExpected>) => ({
      auto: o.auto.map((m) => `${m.statementId}->${m.requestId}`),
      review: o.review.map((m) => `${m.statementId}->${m.requestId}`),
      unmatched: o.unmatched.map((s) => s.statementId),
    });

    expect(toKey(out1)).toEqual(toKey(out2));
  });
});
