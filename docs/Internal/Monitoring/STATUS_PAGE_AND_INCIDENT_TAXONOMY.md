# Status Page & Incident Taxonomy (SEV1–SEV4)

> **VERIFY-FIRST:** Use this document to satisfy the Part 0 requirement for a public status page and incident taxonomy. Link every incident ticket to the relevant SEV definition and status page entry before closing.

## Status Page Setup

- **URL:** https://status.apexmediation.ee
- **Source:** Upptime repository (`infra/status-page`), deployed via GitHub Pages.
- **Automations:**
  - Synthetic probes from `.github/workflows/synthetic-probes.yml` open incidents automatically.
  - PagerDuty webhooks post updates through `scripts/dev-transparency-metrics.sh` helpers.
- **Ownership:** SRE (`@bel-consulting/platform-infra`).

### Incident Update Cadence

| Phase | Action | Channel |
| --- | --- | --- |
| Detection | Auto-create incident on status page with provisional SEV. | Status page + PagerDuty |
| 15 minutes | Publish customer-facing note (impact, workaround). | Status page + CS email list |
| 60 minutes | Provide next update even if no change. | Status page + #customer-sos |
| Resolution | Mark resolved, include root cause summary + follow-up ticket link. | Status page + incident review doc |

## Incident Taxonomy

| Severity | Definition | Examples | Response Targets |
| --- | --- | --- | --- |
| **SEV1 – Critical Outage** | Full ad delivery outage, billing corruption, PII/key leak. | Auction API returning ≥50% errors; transparency receipts failing entirely. | Page primary on-call immediately, exec bridge within 15 min, status page within 10 min. |
| **SEV2 – Major Degradation** | Partial impact (>15% of traffic) or core workflow broken. | Single SDK platform crash loop, delayed invoices, stalled transparency signer. | Page on-call, engage feature owners, update status page within 20 min. |
| **SEV3 – Minor Incident** | Limited impact (<15%), workaround available. | Specific bidder timing out, status page degraded component, delayed report export. | Notify on-call via Slack/PagerDuty, status page optional (degraded). |
| **SEV4 – Informational** | No customer impact yet; heads-up or scheduled maintenance. | Planned maintenance, partner API warning, low-risk anomaly. | Log in incident tracker, optional status page maintenance entry. |

## Communication Templates

- **Initial Post:**
  > _"We are investigating increased auction latency affecting {regions}. Ads may fail to load. Next update in 30 minutes."_
- **Mitigation Update:**
  > _"We rate-limited bidder {X} and traffic is recovering. Monitoring before closing."
- **Resolution:**
  > _"Issue resolved at HH:MM UTC. Root cause: {summary}. Post-incident review scheduled on {date}."_

## Evidence & Tooling

- PagerDuty service: `ApexMediation-Prod`
- Status page repo: `monitoring/upptime.yml` (see `docs/Monitoring/grafana-dashboards.yml` for dashboards referenced in incidents)
- Runbook tie-in: `docs/Internal/Operations/ON_CALL_RUNBOOK.md` describes who posts which update when.

## Post-Incident Requirements

1. File RCA using `ISSUE_TEMPLATE/rca.md`.
2. Link RCA + incident ticket from status page post.
3. Update `docs/Internal/Development/FIXES.md` with remediation tasks.
4. Confirm transparency receipts and billing reconciliations are healthy before closing SEV1/SEV2 issues.
