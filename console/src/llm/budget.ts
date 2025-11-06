// Simple budget metering and guardrails for LLM autonomy (dev-only scaffolding)
// Tracks estimated spend and enforces daily/monthly caps with graceful degradation.

export interface BudgetCaps {
  monthlyUSD: number; // hard cap
  dailyUSD: number;   // soft/hard daily limit
}

export interface SpendSnapshot {
  monthToDateUSD: number;
  dayToDateUSD: number;
  alerts: string[];
  hardStop: boolean;
}

export class BudgetMeter {
  private mtd = 0;
  private dtd = 0;
  private alerts: string[] = [];

  constructor(private caps: BudgetCaps) {}

  record(costUSD: number) {
    this.mtd += costUSD;
    this.dtd += costUSD;
  }

  resetDay() { this.dtd = 0; this.alerts = []; }

  snapshot(now = new Date()): SpendSnapshot {
    this.alerts = [];
    const { monthlyUSD, dailyUSD } = this.caps;

    const thresholds = [0.5, 0.75, 0.9, 1.0];
    const ratio = this.mtd / monthlyUSD;
    for (const t of thresholds) {
      if (ratio >= t) this.alerts.push(`monthly_${Math.round(t*100)}pct`);
    }

    const hardStop = this.mtd >= monthlyUSD || this.dtd >= dailyUSD;
    if (this.dtd / dailyUSD >= 1.0) this.alerts.push('daily_100pct');
    else if (this.dtd / dailyUSD >= 0.9) this.alerts.push('daily_90pct');

    return {
      monthToDateUSD: round2(this.mtd),
      dayToDateUSD: round2(this.dtd),
      alerts: [...this.alerts],
      hardStop,
    };
  }
}

function round2(n: number) { return Math.round(n * 100) / 100; }
