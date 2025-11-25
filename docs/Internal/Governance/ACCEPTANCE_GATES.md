# Acceptance Gates — SDKs, APIs, Dashboard

> **VERIFY-FIRST:** Use this gating document to satisfy Part 0 of the checklist before declaring any surface "ready" in customer-facing docs or release notes. Each stage demands explicit evidence captured in the linked runbooks/tests.

## Surfaces & Stage Criteria

| Surface | Alpha (internal dogfood) | Beta (design partners) | GA (general availability) | Evidence Links |
| --- | --- | --- | --- | --- |
| SDKs (Android, iOS, Unity, Web/CTV) | All unit tests + conformance suites passing; feature flags default-off; release notes drafted. | External pilot apps (≥3) live; crash-free rate ≥99.5%; Docs reviewed by Support; runbook dry-runs done. | ≥100k sessions; crash-free ≥99.9%; ANR ≤0.02%; `sdk-release.yml` tagged build signed + posted; status page announcement published. | `docs/Internal/Development/SDK_IMPLEMENTATION.md`, `.github/workflows/sdk-release.yml`, `docs/Customer-Facing/SDK-Integration/` |
| Auction + Adapters | Load tests with synthetic bidders; shadow logs validated; FAILSAFE configs reviewed. | Hedged requests enabled for ≥50% traffic; observability dashboards live; rollback tested. | All bidders pass `*_conformance_test.go`; `/v1/auction` SLO burn < 10%; transparency receipts produced; runbook sign-off. | `backend/auction/internal/bidders/*`, `docs/Internal/Deployment/ROLLOUT_STRATEGY.md`, `docs/runbooks/OBSERVABILITY_RUNBOOK.md` |
| Console/API (Reporting & Billing) | Feature flags present; contract tests covering top APIs; auth flows behind preview toggles. | First billing customer invoiced in sandbox; privacy export/delete tested; audit logs verified. | Production invoices reconciled; payment automation live; DPA signed; legal templates attached to release. | `docs/Internal/Operations/BILLING_PLAYBOOK.md`, `docs/Internal/Security/DATA_MAP.md`, `console/README.md` |
| Observability & Status Page | Dashboards render sample data; alerts firing to test channel; status page repo created. | PagerDuty + status page automation connected; SEV drills performed. | Status page public (`status.apexmediation.ee`); SEV policy enforced; postmortem template used after first incident. | `docs/Monitoring/STATUS_PAGE_AND_INCIDENT_TAXONOMY.md`, `docs/Internal/Operations/ON_CALL_RUNBOOK.md` |

## Promotion Checklist

1. **Log evidence** (screenshots, test outputs) inside the linked doc or Actions artifacts before promoting.
2. **Update `docs/Internal/Development/FIXES.md`** with the FIX ID covering the promotion.
3. **Post summary to status page + release notes** describing gates cleared.
4. **Record decision** in appropriate ADR if architecture changes (e.g., enabling new bidder class).

Use this file as the canonical reference when auditors request proof that the product followed disciplined stage gates.
