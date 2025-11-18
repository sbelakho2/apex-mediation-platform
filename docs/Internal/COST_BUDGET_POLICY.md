# Cost Budget Policy — Platform + LLM (Hard Cap $500/month)

_Last updated: 2025-11-18_  
_Owner: Platform Engineering / Autonomy WG_  
_Review Cycle: Monthly spend review, policy review quarterly (next review: 2026-02-18)_  
_Status: Active - enforced via process + CI; programmatic enforcers in progress_

> **FIX-10 governance:** This policy sets spending limits. Actual spend must be tracked in monthly cost reports under `docs/Internal/CostReports/`. For implementation status, see `docs/Internal/Development/FIXES.md` (FIX-11 tracking).

**Current Month Budget Compliance:** _[To be updated monthly with actual vs cap]_

Purpose
- Ensure the entire system (infrastructure + LLM autonomy) operates under a hard budget cap of $500/month.
- Provide a concrete metering, alerting, and fail-safe plan so autonomy can run continuously without cost overruns.

Targets (default, configurable)
- Infra/runtime: ≤ $200/mo (compute, storage, monitoring). If running entirely on local/dev infra, this is $0.
- LLM providers total: ≤ $200/mo combined across ChatGPT and Junie.
- Buffer/contingency: $100/mo reserved for spikes.

Policy
1) Hard monthly cap: $500. Autonomy tools must degrade gracefully as burn approaches the cap.
2) Thresholds & actions:
   - 50% ($250): soft alert in Slack/logs; planner scales down to every two weeks for non-critical work.
   - 75% ($375): freeze non-essential autonomy tasks; only bug fixes, security, and high-ROI items proceed.
   - 90% ($450): disable code-generation tasks; planner operates in analysis-only mode; website/dashboard and docs updates via local diffs only.
   - 100% ($500): hard stop for paid provider calls until the next cycle unless manual override.
3) Daily guardrails: Default daily LLM spend limit $8 (adjustable). Exceeding daily limit triggers cool-down until next UTC day.
4) CI Gate: Per-PR autonomy jobs must estimate max LLM cost for their steps and fail if estimate exceeds per-PR cap ($0.50 by default).
5) Provider routing: Prefer the lower-cost provider (Junie) for planning/analysis when quality is equivalent; reserve ChatGPT for code transforms/tests when success-rate is materially higher.
6) Data retention: Keep token usage logs (redacted) for 90 days for auditing.

Implementation Blueprint
- Metering library (console/src/llm/budget.ts)
  - Track: tokens_in, tokens_out, estimated_$ by provider and job.
  - Export weekly cost report artifact (JSON + Markdown) committed under docs/Internal/CostReports/.
  - Emit alerts at the thresholds above.
- Provider abstraction (console/src/llm/providers.ts)
  - chatgptProvider and junieProvider share a common interface (complete, stream, pricing per 1K tokens).
  - Router: selects provider per task class and remaining budget.
- Config
  - ENV: LLM_MONTHLY_CAP, LLM_DAILY_CAP, PROVIDER_PRIORITIES, DRY_RUN (for autonomy planner/executor).
  - Default caps as above; overridable via .env or CI secrets.
- Failsafes
  - When monthly burn ≥ 90%, force DRY_RUN=true on autonomy jobs.
  - When monthly burn ≥ 100%, block paid calls; fall back to cached analyses and offline tests.

Acceptance Criteria (to mark policy as enforced)
- Weekly budget report produced automatically with provider breakdown and remaining budget.
- Alerts generated at 50/75/90/100% in logs (and Slack/Webhook if configured).
- Autonomy jobs demonstrate cool-down/degradation under simulated high-burn tests.

Notes
- Pricing tables should be versioned per provider and updated quarterly.
- This policy complements the AUTO section in DEVELOPMENT_TODO_CHECKLIST.md.
