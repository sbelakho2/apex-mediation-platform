# Single-Operator Runbook — Daily/Weekly Checklist

Last updated: 2025-11-07
Owner: Platform Engineering

Purpose
- Enable one operator to run the platform with < 2 hours/week by following a crisp checklist and using built-in dashboards/APIs.
- Ensure reliability, transparency, and fast rollback under the $500/month budget.

Prerequisites
- Auction service running with Admin APIs enabled and CORS_ORIGIN set for the website.
- Website dashboard reachable (Observability Overview, Adapter Metrics, Mediation Debugger pages).
- Optional: Autonomy planner installed for weekly PRs (see docs/Internal/Development/DEVELOPMENT_TODO_CHECKLIST.md, AUTO section).

Daily (≈ 15 minutes)
1) Observe SLO badge status (Website → Observability → Overview)
   - If any adapter SLO status is WARN/CRIT for p99 latency, error rate, or fill rate:
     - Open Mediation Debugger for impacted placement(s) and tail last-N events.
     - Note transient vs. persistent patterns.
2) Check Adapter Metrics snapshot (Website → Observability → Metrics)
   - Scan for sudden spikes in timeouts or circuit_open reasons.
   - If persistent across 1h, consider temporarily disabling the adapter for select placements until triaged.
3) Budget/Autonomy
   - Confirm autonomy jobs (if enabled) did not hit 75/90% budget thresholds (see COST_BUDGET_POLICY.md).
   - If ≥ 90%, degrade autonomy mode per policy (planner dry-run only), and leave a note in the weekly PR.

Weekly (≈ 45 minutes)
1) Review the autonomy planner PR (if enabled)
   - Ensure snapshot includes: adapter trends, auction overruns, circuit breaker stats, ML shadow score histograms/drift, TODO deltas.
   - Approve low-risk changes; schedule reviews for high-risk items (schema/privacy/payments).
2) Reconcile adapter status vs. Must-Have list
   - Check DEVELOPMENT_TODO_CHECKLIST.md (P2 → Adapter expansion) to ensure ≥ 12 targets are on track.
   - If any network has sustained CRIT SLO but is critical to revenue, prefer server-side fixes or temporary waivers documented in API_KEYS_AND_INTEGRATIONS_GUIDE.md.
3) ML shadow monitoring
   - Review weekly ML shadow distributions and drift metrics (when available).
   - Do not disable shadow-mode until acceptance targets are met for 4 consecutive weeks.
4) Website a11y/perf
   - Run Lighthouse/a11y checks (CI or locally). Ensure budgets are met; file tasks for regressions.

Incident response (playbook)
- If SLO CRIT sustained > 30 minutes or auctions breach deadlines:
  - Disable hedging (if suspected of spiking backend) or increase hedging delay to p99.
  - Quarantine offending adapter(s) by toggling config; use kill-switch if a global rollback is required.
  - Open a Mediation Debugger trace bundle and attach to the incident note.

Rollbacks
- Use the OTA config kill-switch to halt all loads immediately.
- Revert the last 1–3 autonomy PRs if they are suspected to cause issues; rehearse quarterly per AUTO section.

References
- SLO/Alerts: docs/runbooks/SLOS_AND_ALERTS.md
- Observability Runbook: docs/runbooks/OBSERVABILITY_RUNBOOK.md
- Cost Policy: docs/Internal/COST_BUDGET_POLICY.md
- Development TODO: docs/Internal/Development/DEVELOPMENT_TODO_CHECKLIST.md
