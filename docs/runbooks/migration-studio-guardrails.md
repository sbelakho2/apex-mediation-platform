# Migration Studio Guardrails Runbook

## Overview

Migration Studio guardrails protect revenue and user experience during experiment execution. This runbook explains how to respond to guardrail violations.

## Alert Types

### 1. MigrationGuardrailPause (Warning)
**Triggered when**: Non-critical guardrail violation detected
- **Severity**: Warning
- **Auto-remediation**: Experiment auto-paused, reverted to shadow mode
- **Reason codes**: `latency`, `error`, `fill`

**Response**:
1. Check Grafana Migration Studio dashboard for experiment metrics
2. Review guardrail thresholds in experiment configuration:
   ```bash
   psql $DATABASE_URL -c "SELECT id, name, guardrails FROM migration_experiments WHERE id = '<exp_id>';"
   ```
3. Analyze root cause:
   - **Latency**: Check adapter p95 latency, timeout spikes
   - **Error**: Review `rtb_errors_total` by adapter and code
   - **Fill**: Verify adapter health, check for outages
4. If transient issue: Resume experiment
   ```bash
   curl -X POST "https://console.rival.com/api/v1/migration/experiments/<exp_id>/activate" \
     -H "Authorization: Bearer $TOKEN"
   ```
5. If persistent: Adjust guardrails or fix adapter configuration

### 2. MigrationKillSwitch (Critical)
**Triggered when**: Critical revenue or latency violation
- **Severity**: Critical
- **Auto-remediation**: Experiment killed, traffic reverted to control
- **Reason codes**: `revenue`, `latency`

**Response**:
1. **DO NOT** resume experiment without investigation
2. Review violation details:
   ```bash
   psql $DATABASE_URL -c "SELECT * FROM migration_events WHERE experiment_id = '<exp_id>' AND event_type = 'guardrail_kill' ORDER BY created_at DESC LIMIT 1;"
   ```
3. Check metrics:
   - Revenue delta: Query `migration_guardrail_snapshots` for eCPM comparison
   - Latency: Verify p95 latency exceeded budget
4. Root cause analysis:
   - Review adapter configuration (timeouts, floors)
   - Check for adapter API changes or outages
   - Verify mapping correctness (incumbent vs our adapters)
5. Fix issues, adjust guardrails if appropriate, create new experiment

### 3. MigrationHighLatency (Warning)
**Triggered when**: Test arm p95 latency >500ms for 10+ minutes
- **Severity**: Warning
- **No auto-remediation** (monitor before pause)

**Response**:
1. Check adapter latency breakdown:
   ```promql
   topk(5, histogram_quantile(0.95, rate(rtb_adapter_latency_seconds_bucket{exp_id="<exp_id>"}[5m])))
   ```
2. Identify slow adapters:
   - Check for timeout spikes: `rtb_adapter_timeouts_total`
   - Verify adapter endpoints are healthy
3. If latency persists, reduce `mirror_percent` or pause experiment

### 4. MigrationRevenueDrop (Critical)
**Triggered when**: Test arm eCPM <85% of control for 20+ minutes
- **Severity**: Critical
- **No auto-remediation** (requires manual investigation)

**Response**:
1. Compare eCPM by adapter:
   ```bash
   psql $DATABASE_URL -c "SELECT arm, SUM(revenue_micros) / NULLIF(SUM(impressions), 0) AS ecpm FROM migration_guardrail_snapshots WHERE experiment_id = '<exp_id>' GROUP BY arm;"
   ```
2. Check for mapping errors:
   ```bash
   psql $DATABASE_URL -c "SELECT * FROM migration_mappings WHERE experiment_id = '<exp_id>' AND mapping_status != 'confirmed';"
   ```
3. Verify adapter floors/bids match incumbent setup
4. If underperforming adapter identified, remove from experiment
5. If systemic issue, kill experiment via API

### 5. MigrationTestArmNoFill (Warning)
**Triggered when**: Test arm no-fill rate 20%+ higher than control
- **Severity**: Warning
- **No auto-remediation**

**Response**:
1. Check no-fill rate by adapter:
   ```promql
   sum by (adapter) (rate(rtb_no_fill_total{arm="test",exp_id="<exp_id>"}[15m]))
   ```
2. Identify problematic adapters:
   - Check for recent outages or API changes
   - Verify adapter configuration (API keys, timeouts)
3. If isolated to specific adapter, update mapping or pause adapter
4. If widespread, pause experiment and investigate

## Guardrail Configuration

Guardrails are set per-experiment in the `guardrails` JSONB column:

```json
{
  "latency_budget_ms": 500,
  "revenue_floor_percent": -10,
  "max_error_rate_percent": 5,
  "min_impressions": 1000
}
```

**Updating guardrails**:
```bash
curl -X PUT "https://console.rival.com/api/v1/migration/experiments/<exp_id>" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"guardrails": {"latency_budget_ms": 600, "revenue_floor_percent": -15}}'
```

**Guidelines**:
- `latency_budget_ms`: Set to p95 target (typically 300-500ms)
- `revenue_floor_percent`: Allow 10-15% drop for testing
- `max_error_rate_percent`: Keep <5% for production
- `min_impressions`: Ensure statistical significance (>1000)

## Manual Guardrail Evaluation

Trigger evaluation on-demand:
```bash
curl -X POST "https://console.rival.com/api/v1/migration/experiments/<exp_id>/guardrails/evaluate" \
  -H "Authorization: Bearer $TOKEN"
```

Response includes:
- `shouldPause`: Boolean indicating if guardrails violated
- `violations`: Array of violation descriptions

## Metrics Queries

### eCPM comparison (control vs test)
```promql
sum by (arm) (rate(rtb_wins_total{exp_id="<exp_id>"}[1h]))
  / sum by (arm) (rate(rtb_wins_total{exp_id="<exp_id>"}[1h]) + rate(rtb_no_fill_total{exp_id="<exp_id>"}[1h]))
```

### Latency p95 by arm
```promql
histogram_quantile(0.95, sum by (arm, le) (rate(auction_latency_seconds_bucket{exp_id="<exp_id>"}[5m]))) * 1000
```

### Error rate by arm
```promql
sum by (arm) (rate(rtb_errors_total{exp_id="<exp_id>"}[5m]))
  / sum by (arm) (rate(rtb_wins_total{exp_id="<exp_id>"}[5m]) + rate(rtb_no_fill_total{exp_id="<exp_id>"}[5m]))
```

## Database Queries

### Recent guardrail snapshots
```sql
SELECT arm, captured_at, impressions, fills, revenue_micros, latency_p95_ms, error_rate_percent
FROM migration_guardrail_snapshots
WHERE experiment_id = '<exp_id>'
ORDER BY captured_at DESC
LIMIT 20;
```

### Experiment event log
```sql
SELECT event_type, reason, triggered_by, created_at, event_data
FROM migration_events
WHERE experiment_id = '<exp_id>'
ORDER BY created_at DESC
LIMIT 10;
```

### Audit trail (who changed what)
```sql
SELECT user_id, action, resource_type, old_value, new_value, created_at
FROM migration_audit
WHERE experiment_id = '<exp_id>'
ORDER BY created_at DESC
LIMIT 10;
```

## Escalation

If unable to resolve within 30 minutes:
1. Slack: #migration-studio-alerts
2. On-call: PagerDuty "Migration Studio" service
3. Document findings in incident ticket

## Related Documentation

- [Migration Studio Architecture](../Features/MigrationStudio/README.md)
- [Experiment Report Verification](../Features/MigrationStudio/README.md#report-verification)
- [Prometheus Metrics Catalog](../observability/metrics.md)
