# Transparency Key Rotation Operations Guide

**Last updated:** 2025-11-10  
**Status:** Production-ready  
**Audience:** Operations, Platform Engineering

---

## Overview

This guide covers operational procedures for managing Ed25519 signing keys used in the transparency system, including key rotation, sampling rollout strategies, and publisher-specific overrides.

## Key Rotation Procedure

### Prerequisites

- Access to the production database (`transparency_signer_keys` table)
- Ed25519 keypair generation tool (e.g., OpenSSL, Node crypto, or custom script)
- Appropriate authentication credentials for database access

### Step-by-Step Rotation

#### 1. Generate New Ed25519 Keypair

```bash
# Using OpenSSL
openssl genpkey -algorithm ed25519 -out private.pem
openssl pkey -in private.pem -pubout -out public.pem

# Extract base64-encoded public key (without PEM headers)
grep -v "BEGIN\|END" public.pem | tr -d '\n'
```

Save the **private key** securely (e.g., AWS Secrets Manager, HashiCorp Vault) and the **public key** for database insertion.

#### 2. Insert New Key into Database

```sql
INSERT INTO transparency_signer_keys (
  key_id,
  algo,
  private_key_pem,
  public_key_base64,
  active
) VALUES (
  'key-2025-11-10-v2',  -- Unique identifier (versioned, timestamped)
  'Ed25519',
  '<private-key-pem-string>',
  '<public-key-base64-string>',
  1  -- Set active=1 to enable signing with this key
);
```

**Key ID Convention:**  
Use format `key-YYYY-MM-DD-vN` for clarity and traceability.

#### 3. Graceful Cutover with Overlap

The `TransparencyWriter` automatically selects the **most recently inserted active key** for signing. To ensure zero downtime:

1. **Keep old key active** during rollout (both keys are active simultaneously)
2. **Deploy new key** (insert into database with `active=1`)
3. **Monitor signatures** using Prometheus metrics (`transparency_writes_succeeded`, `transparency_signature_errors`)
4. **Wait for cache propagation** (if using CDN/caching for `/keys` endpoint)
5. **Deactivate old key** after confirmed stability (set `active=0`)

```sql
-- Deactivate old key after successful cutover
UPDATE transparency_signer_keys
SET active = 0
WHERE key_id = 'key-2024-12-01-v1';
```

#### 4. Verification

Test the new key using the CLI verifier:

```bash
npm --prefix backend run verify:transparency -- \
  --auction <uuid> \
  --publisher <uuid> \
  --json

# Or with explicit key override:
npm --prefix backend run verify:transparency -- \
  --auction <uuid> \
  --publisher <uuid> \
  --key <base64-public-key> \
  --json
```

Check for `"status": "PASS"` in JSON output.

---

## Sampling Rollout Strategies

### Global Sampling Configuration

The transparency system supports probabilistic sampling to control write volume. The global sampling rate is controlled via environment variable:

```bash
TRANSPARENCY_SAMPLE_BPS=1000  # 10.00% (basis points: 100 bps = 1%)
```

**Default:** `0` (sampling disabled, all auctions are logged)

### Publisher-Specific Overrides

Override sampling for specific publishers to test transparency logging or provide enhanced transparency to premium partners:

```bash
# Enable 100% sampling for publisher abc123
TRANSPARENCY_PUBLISHER_SAMPLE_BPS_abc123=10000

# Enable 25% sampling for publisher def456
TRANSPARENCY_PUBLISHER_SAMPLE_BPS_def456=2500
```

**Environment Variable Format:**  
`TRANSPARENCY_PUBLISHER_SAMPLE_BPS_{publisher_id}=<bps>`

### Rollout Strategies

#### Strategy 1: Phased Global Rollout

1. Start with low global sampling (e.g., `100` bps = 1%)
2. Monitor ClickHouse ingestion rate, query performance, storage growth
3. Gradually increase sampling in increments:
   - Week 1: 100 bps (1%)
   - Week 2: 500 bps (5%)
   - Week 3: 2000 bps (20%)
   - Week 4: 10000 bps (100%)
4. Validate no degradation in API latency or ClickHouse performance

#### Strategy 2: Per-Publisher Beta Testing

1. Set global sampling to `0` (disabled)
2. Enable 100% sampling for beta publishers:
   ```bash
   TRANSPARENCY_PUBLISHER_SAMPLE_BPS_publisher1=10000
   TRANSPARENCY_PUBLISHER_SAMPLE_BPS_publisher2=10000
   ```
3. Collect feedback on API usability, Console UI, and verification workflows
4. Gradually expand to more publishers
5. Enable global sampling once stable

#### Strategy 3: Traffic-Based Targeting

1. Use overrides to target high-traffic publishers first (stress testing)
2. Monitor metrics for memory pressure, ClickHouse query latency spikes
3. Once validated, enable global sampling for all publishers

---

## Monitoring and Alerts

### Key Metrics to Track

**Prometheus Metrics:**
- `transparency_writes_attempted_total`: Total write attempts
- `transparency_writes_succeeded_total`: Successful writes
- `transparency_writes_failed_total`: Failed writes (by error type)
- `transparency_writes_breaker_skipped_total`: Circuit breaker activations
- `transparency_writes_duration_ms`: Write latency histogram

**ClickHouse Health:**
- Query response time for `/auctions` API endpoint
- Storage utilization in `transparency.auctions` table
- Replication lag (if using ClickHouse replication)

### Recommended Alerts

```yaml
# Prometheus alert rules (alerts.yml)
- alert: TransparencyWriteFailureRate
  expr: rate(transparency_writes_failed_total[5m]) / rate(transparency_writes_attempted_total[5m]) > 0.05
  for: 10m
  labels:
    severity: warning
  annotations:
    summary: "High transparency write failure rate (>5%)"

- alert: TransparencyBreakerTripped
  expr: rate(transparency_writes_breaker_skipped_total[5m]) > 0
  for: 5m
  labels:
    severity: critical
  annotations:
    summary: "Transparency circuit breaker tripped"
```

---

## Rollback Procedures

### Rolling Back a Key Rotation

If the new key causes signature verification failures:

1. **Deactivate the new key immediately:**
   ```sql
   UPDATE transparency_signer_keys SET active = 0 WHERE key_id = 'key-2025-11-10-v2';
   ```

2. **Reactivate the old key:**
   ```sql
   UPDATE transparency_signer_keys SET active = 1 WHERE key_id = 'key-2024-12-01-v1';
   ```

3. **Investigate signature verification errors** using CLI `--json` output:
   ```bash
   npm --prefix backend run verify:transparency -- \
     --auction <failing-uuid> \
     --publisher <uuid> \
     --json
   ```

4. **Check for key format issues** (SPKI DER vs PEM, base64 encoding errors)

### Rolling Back Sampling Changes

If sampling rate causes performance degradation:

1. **Lower global sampling rate:**
   ```bash
   TRANSPARENCY_SAMPLE_BPS=500  # Reduce from 10000 to 500 bps
   ```

2. **Remove publisher overrides temporarily:**
   ```bash
   unset TRANSPARENCY_PUBLISHER_SAMPLE_BPS_abc123
   ```

3. **Restart affected services** to apply environment changes

---

## Troubleshooting

### Scenario: Signature Verification Fails After Key Rotation

**Symptoms:** CLI outputs `"status": "FAIL"`, server returns `"status": "fail"`

**Diagnosis:**
1. Check if new key is active:
   ```sql
   SELECT key_id, active FROM transparency_signer_keys ORDER BY id DESC LIMIT 5;
   ```

2. Verify key format:
   ```bash
   # Test key parsing (should not throw errors)
   echo '<public-key-base64>' | base64 -d | openssl pkey -pubin -inform DER -text
   ```

3. Check canonicalization consistency:
   - Ensure writer, API, and CLI use the same `canonicalizer.ts` module
   - Verify no drift in field ordering or serialization logic

**Resolution:**
- If key format is incorrect, regenerate keypair and re-insert
- If canonicalization is mismatched, audit recent code changes to `canonicalizer.ts`

### Scenario: Circuit Breaker Triggers After Key Rotation

**Symptoms:** Metrics show `transparency_writes_breaker_skipped_total` increasing

**Diagnosis:**
- Check ClickHouse connectivity: `SELECT 1 FROM transparency.auctions LIMIT 1`
- Review transient error logs (500/502/503 responses from ClickHouse)

**Resolution:**
- If ClickHouse is healthy but breaker is stuck, restart writer service to reset breaker state
- If ClickHouse is down, fix underlying infrastructure issue first

### Scenario: Sampling Overrides Not Applied

**Symptoms:** Publisher-specific sampling rate not reflected in transparency logs

**Diagnosis:**
1. Verify environment variable format:
   ```bash
   echo $TRANSPARENCY_PUBLISHER_SAMPLE_BPS_abc123
   ```

2. Check if service was restarted after env change:
   ```bash
   docker logs <container-id> | grep "TRANSPARENCY_PUBLISHER_SAMPLE_BPS"
   ```

**Resolution:**
- Ensure correct variable naming (no hyphens in publisher IDs, use underscores)
- Restart service to apply environment changes

---

## Best Practices

1. **Always test key rotation in staging environment first**
2. **Use versioned key IDs** for easy rollback (`key-YYYY-MM-DD-vN`)
3. **Maintain key overlap period** (both old and new keys active) for at least 24 hours
4. **Monitor signature verification metrics** after rotation
5. **Document key rotation in changelog** (DEVELOPMENT_TODO_CHECKLIST.md)
6. **Store private keys in secure vault** (AWS Secrets Manager, HashiCorp Vault)
7. **Set up alerts for circuit breaker trips and high failure rates**
8. **Test sampling overrides with low-traffic publishers** before global rollout

---

## References

- **Transparency Writer:** `backend/src/services/transparencyWriter.ts`
- **Canonicalizer Module:** `backend/src/services/transparency/canonicalizer.ts`
- **CLI Verifier:** `backend/scripts/transparency-verify.ts`
- **Verification Guide:** `docs/Transparency/VERIFY.md`
- **API Controller:** `backend/src/controllers/transparency.controller.ts`
- **Metrics Dashboard:** Grafana (Prometheus datasource, `transparency_*` metrics)

---

## Changelog

- **2025-11-10:** Initial operations guide created (covers key rotation, sampling rollout, troubleshooting)
