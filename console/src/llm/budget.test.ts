import { BudgetMeter, InMemoryBudgetStorage, type BudgetCaps } from './budget'
import type { BudgetScope } from './budget'

const caps: BudgetCaps = { monthlyUSD: 100, dailyUSD: 10 }
const baseScope: BudgetScope = { tenantId: 'tenant-1', userId: 'user-1', sessionId: 'session-a' }

describe('BudgetMeter', () => {
  let storage: InMemoryBudgetStorage

  beforeEach(() => {
    storage = new InMemoryBudgetStorage()
  })

  it('persists spend per scope and survives reloads', async () => {
    const meter = new BudgetMeter(caps, baseScope, { storage })

    await meter.recordUsage({ provider: 'chatgpt', tokensIn: 1_000, tokensOut: 500 })
    const snapshot = meter.snapshot()
    expect(snapshot.monthToDateUSD).toBeGreaterThan(0)

    const reload = new BudgetMeter(caps, baseScope, { storage })
    const reloadedSnapshot = reload.snapshot()
    expect(reloadedSnapshot.monthToDateUSD).toBeCloseTo(snapshot.monthToDateUSD, 5)
  })

  it('isolates scopes so tenants do not leak data', async () => {
    const meterA = new BudgetMeter(caps, baseScope, { storage })
    const meterB = new BudgetMeter(caps, { tenantId: 'tenant-1', userId: 'user-2' }, { storage })

    await meterA.recordUsage({ provider: 'junie', tokensIn: 800, tokensOut: 200 })
    expect(meterB.snapshot().monthToDateUSD).toBe(0)
  })

  it('resets daily totals when the day rolls over but keeps month totals', async () => {
    let current = new Date('2025-01-01T12:00:00Z')
    const now = () => current
    const meter = new BudgetMeter(caps, baseScope, { storage, now })

    await meter.record(5)
    expect(meter.snapshot().dayToDateUSD).toBeCloseTo(5)

    current = new Date('2025-01-02T09:00:00Z')
    const afterReset = meter.snapshot()
    expect(afterReset.dayToDateUSD).toBe(0)
    expect(afterReset.monthToDateUSD).toBeGreaterThan(0)
  })

  it('serializes concurrent updates to avoid racing totals', async () => {
    const meter = new BudgetMeter(caps, baseScope, { storage })
    await Promise.all(
      Array.from({ length: 5 }).map(() => meter.recordUsage({ provider: 'chatgpt', tokensIn: 500, tokensOut: 250 })),
    )
    const snapshot = meter.snapshot()
    expect(snapshot.monthToDateUSD).toBeGreaterThan(0)
  })
})
