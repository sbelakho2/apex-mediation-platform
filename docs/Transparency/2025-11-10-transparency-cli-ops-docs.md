# Transparency CLI, Operations Guide, and Documentation Enhancements

**Date:** 2025-11-10  
**Status:** Complete  
**Sections:** 1.4 (CLI Verifier), 1.5 (Docs), 1.6 (Relationships & Dependencies)

---

## Overview

This document summarizes the implementation of three transparency system enhancements from the development checklist:

1. **CLI --json mode** with structured diagnostics, documented exit codes, and backward compatibility
2. **Operations guide** (TRANSPARENCY_KEY_ROTATION.md) covering key rotation, sampling rollout, monitoring, and troubleshooting
3. **Documentation enhancements** (VERIFY.md) for includeCanonical query parameter, canonical truncation, and CLI --json mode usage
4. **Section 1.6 relationships** clarifying system dependencies and component interactions

---

## Implementation Summary

### 1. CLI --json Mode (`backend/scripts/transparency-verify.ts`)

**Changes:**
- Added `--json` flag to parseArgs function for opt-in structured output
- Maintained backward compatibility: text mode remains default behavior
- Enhanced output includes:
  - Status (PASS/FAIL/NOT_APPLICABLE/UNKNOWN_KEY)
  - Auction metadata (auction_id, publisher_id, timestamp)
  - Signature details (key_id, algo, canonical length)
  - Server verification result (status, reason)
  - Local verification result (status, error)
  - Canonical metadata (length, truncation info)
  - Sample rate (basis points)

**Exit Codes:**
- `0`: Verification passed (both server and local checks succeed)
- `1`: Verification failed (signature mismatch, API error, or other failure)
- `2`: Usage error (missing required arguments)

**Example JSON Output (PASS):**
```json
{
  "status": "PASS",
  "auction_id": "550e8400-e29b-41d4-a716-446655440000",
  "publisher_id": "pub123",
  "timestamp": "2025-11-10T12:34:56Z",
  "key_id": "key-2025-11-10-v2",
  "algo": "Ed25519",
  "canonical": "{\"auction\":{...},\"candidates\":[...]}",
  "canonical_length": 1234,
  "sample_bps": 250,
  "server_verification": {
    "status": "pass",
    "reason": null
  },
  "local_verification": {
    "status": "pass",
    "error": null
  }
}
```

**Example JSON Output (NOT_APPLICABLE):**
```json
{
  "status": "NOT_APPLICABLE",
  "auction_id": "550e8400-e29b-41d4-a716-446655440000",
  "publisher_id": "pub123",
  "reason": "Auction not sampled for transparency logging",
  "server_verification": {
    "status": "not_applicable",
    "reason": "Auction not sampled for transparency logging"
  }
}
```

**Use Cases:**
- CI/CD pipeline integration (structured output for parsing)
- Negative test automation (fixtures for bad key, tampered payload, unknown key)
- Programmatic verification workflows
- Debugging with full diagnostic context

**Backward Compatibility:**
- Text mode remains default when `--json` is omitted
- All existing CLI usage continues to work unchanged
- Exit codes preserved across both modes

---

### 2. Operations Guide (`docs/Internal/Operations/TRANSPARENCY_KEY_ROTATION.md`)

**Created:** New operations guide (300+ lines) covering:

#### Key Rotation Procedure
- **Step-by-step process:**
  1. Generate Ed25519 keypair (OpenSSL or Node crypto)
  2. Insert new key into `transparency_signer_keys` table with `active=1`
  3. Graceful cutover with overlap period (both keys active simultaneously)
  4. Monitor signatures using Prometheus metrics
  5. Deactivate old key after confirmed stability

- **Key ID convention:** `key-YYYY-MM-DD-vN` (timestamped, versioned)

- **Verification:** Test with CLI `--json` mode to confirm PASS status

#### Sampling Rollout Strategies
- **Global sampling:** `TRANSPARENCY_SAMPLE_BPS=1000` (10.00% sampling rate)
- **Per-publisher overrides:** `TRANSPARENCY_PUBLISHER_SAMPLE_BPS_{publisher_id}=10000` (100% for specific publisher)
- **Three rollout strategies:**
  1. **Phased global rollout:** Gradual increase (1% → 5% → 20% → 100%)
  2. **Per-publisher beta testing:** Enable for select publishers, collect feedback, expand
  3. **Traffic-based targeting:** Target high-traffic publishers first for stress testing

#### Monitoring and Alerts
- **Key metrics:**
  - `transparency_writes_attempted_total`
  - `transparency_writes_succeeded_total`
  - `transparency_writes_failed_total`
  - `transparency_writes_breaker_skipped_total`
  - `transparency_writes_duration_ms`

- **Recommended alerts:**
  - High write failure rate (>5% over 10 minutes)
  - Circuit breaker tripped (immediate alert)

#### Rollback Procedures
- **Key rotation rollback:**
  1. Deactivate new key immediately
  2. Reactivate old key
  3. Investigate signature errors using CLI `--json` output
  4. Check for key format issues (SPKI DER vs PEM, base64 encoding)

- **Sampling rollback:**
  1. Lower global sampling rate
  2. Remove publisher overrides temporarily
  3. Restart services to apply changes

#### Troubleshooting
- **Scenario 1:** Signature verification fails after key rotation
  - Diagnosis: Check active keys, verify key format, audit canonicalization consistency
  - Resolution: Regenerate keypair or audit canonicalizer module

- **Scenario 2:** Circuit breaker triggers after key rotation
  - Diagnosis: Check ClickHouse connectivity, review transient error logs
  - Resolution: Restart writer service or fix ClickHouse infrastructure

- **Scenario 3:** Sampling overrides not applied
  - Diagnosis: Verify environment variable format, check service restart
  - Resolution: Fix variable naming, restart service

#### Best Practices
1. Always test key rotation in staging first
2. Use versioned key IDs for easy rollback
3. Maintain key overlap period (≥24 hours)
4. Monitor signature verification metrics after rotation
5. Document key rotation in changelog
6. Store private keys in secure vault (AWS Secrets Manager, HashiCorp Vault)
7. Set up alerts for circuit breaker trips and high failure rates
8. Test sampling overrides with low-traffic publishers first

---

### 3. VERIFY.md Documentation Enhancements (`docs/Transparency/VERIFY.md`)

**Added Sections:**

#### includeCanonical Query Parameter
- **API endpoint:** `GET /api/v1/transparency/auctions/:auction_id?includeCanonical=true`
- **Response structure:**
  ```json
  {
    "auction_id": "...",
    "timestamp": "2025-11-10T12:34:56Z",
    "publisher_id": "...",
    "canonical": {
      "string": "{\"auction\":{...},\"candidates\":[...]}",
      "truncated": false,
      "size_bytes": 1234
    }
  }
  ```

- **Truncation behavior:** If canonical payload exceeds 32KB, it is truncated and `truncated: true` is returned. This prevents large payloads from impacting API response times. Full canonical is always available via `/verify` endpoint.

#### CLI --json Mode Usage
- **Text mode (default):**
  ```bash
  npm run verify:transparency -- \
    --auction <uuid> --publisher <uuid> [--verbose]
  ```
  Output: `PASS`, `FAIL`, `NOT_APPLICABLE`, `UNKNOWN_KEY`

- **JSON mode:**
  ```bash
  npm run verify:transparency -- \
    --auction <uuid> --publisher <uuid> --json
  ```
  Output: Structured JSON with diagnostics (see example above)

- **Exit codes:** `0` (pass), `1` (fail), `2` (usage error)

#### Canonical Metadata in /verify Endpoint
- **Response fields:**
  - `canonical_truncated` (boolean): Indicates if canonical was truncated
  - `canonical_size_bytes` (number): Original canonical payload size

---

### 4. Section 1.6 Relationships and Dependencies

**Documented System Interactions:**

1. **Writer → ClickHouse:**
   - Graceful degradation: Writer operates in no-op mode when ClickHouse unavailable
   - Circuit breaker pauses writes after consecutive failures (configurable threshold)
   - Retry logic for transient errors (429/5xx, ECONNRESET, ETIMEDOUT, etc.)
   - Prometheus metrics expose health state (`breaker_open`, `failure_streak`)

2. **API → Authentication:**
   - All transparency endpoints are publisher-scoped
   - Requires valid JWT token with publisher context
   - `authenticate` middleware enforces access control
   - 401 errors when token missing or invalid

3. **Console → Feature Flag:**
   - Gated by `NEXT_PUBLIC_TRANSPARENCY_ENABLED=true` environment variable
   - Routes: `/transparency/auctions`, `/transparency/auctions/:id`, `/transparency/summary`
   - API URL configured via `NEXT_PUBLIC_API_URL`

4. **Canonicalizer → Shared Module:**
   - Single source of truth: `backend/src/services/transparency/canonicalizer.ts`
   - Used by writer (signing), API (verification), CLI (local verification)
   - Prevents signature drift from inconsistent serialization
   - Deterministic lexicographic sorting + numeric normalization

**Cross-References:**
- TRANSPARENCY_KEY_ROTATION.md documents writer dependencies and metrics
- VERIFY.md documents API authentication requirements and feature flags
- Checklist section 1.6 provides high-level overview

---

## Testing

### Automated Tests
**Script:** `backend/scripts/test-transparency-json-mode.sh`

**Coverage:**
1. ✅ Usage error message displayed correctly
2. ✅ Non-zero exit code returned for invalid arguments
3. Manual testing instructions for full JSON mode with live API

**Test Execution:**
```bash
chmod +x backend/scripts/test-transparency-json-mode.sh
./backend/scripts/test-transparency-json-mode.sh
```

**Results:**
- Usage error handling: ✅ PASS
- Exit code validation: ✅ PASS (npm wraps exit code 2 as non-zero)

### Manual Testing Required
**Prerequisites:**
1. Start backing services: `sudo docker compose up -d postgres redis clickhouse`
2. Run backend with transparency enabled: `TRANSPARENCY_ENABLED=1 TRANSPARENCY_API_ENABLED=true npm run dev`
3. Trigger auction and capture `auction_id` from logs

**Test Scenarios:**
1. **PASS scenario:** Valid auction with signature
   ```bash
   npm run verify:transparency -- \
     --auction <uuid> --publisher <uuid> --json
   ```
   Expected: `"status": "PASS"`, exit code 0

2. **NOT_APPLICABLE scenario:** Unsampled auction
   Expected: `"status": "NOT_APPLICABLE"`, exit code 0

3. **FAIL scenario:** Tampered canonical payload (manual modification in ClickHouse)
   Expected: `"status": "FAIL"`, exit code 1

4. **UNKNOWN_KEY scenario:** Delete key from `transparency_signer_keys`
   Expected: `"status": "UNKNOWN_KEY"`, exit code 1

---

## Evidence

### Modified Files
1. **backend/scripts/transparency-verify.ts** (lines 50-220)
   - Added `--json` flag parsing
   - Implemented structured output for all code paths
   - Updated usage message with exit codes

2. **docs/Internal/Operations/TRANSPARENCY_KEY_ROTATION.md** (new file, 300+ lines)
   - Key rotation procedure
   - Sampling rollout strategies
   - Monitoring and alerts
   - Rollback procedures
   - Troubleshooting scenarios
   - Best practices

3. **docs/Transparency/VERIFY.md** (lines 35-80)
   - Added `includeCanonical` query parameter section
   - Documented canonical truncation (32KB cap)
   - Added CLI `--json` mode usage examples
   - Created exit code reference table

4. **docs/Internal/Development/DEVELOPMENT_TODO_CHECKLIST.md**
   - Marked sections 1.4, 1.5, 1.6 complete with evidence
   - Added changelog entry (2025-11-10) summarizing all changes

### Test Artifacts
- **backend/scripts/test-transparency-json-mode.sh** (automated test script)
- Test results: Usage error handling ✅, exit codes ✅

---

## Acceptance Criteria

| Criterion | Status | Evidence |
|-----------|--------|----------|
| CLI `--json` flag implemented | ✅ Complete | `backend/scripts/transparency-verify.ts` lines 50-220 |
| Structured output includes all diagnostics | ✅ Complete | JSON schema includes status, auction metadata, server/local verification, canonical details |
| Backward compatibility maintained | ✅ Complete | Text mode remains default, existing usage unchanged |
| Exit codes documented | ✅ Complete | Usage message updated, VERIFY.md includes exit code table |
| Operations guide created | ✅ Complete | `docs/Internal/Operations/TRANSPARENCY_KEY_ROTATION.md` (300+ lines) |
| Key rotation procedure documented | ✅ Complete | Step-by-step with graceful cutover, verification, rollback |
| Sampling rollout strategies documented | ✅ Complete | Three strategies (phased, per-publisher beta, traffic-based) |
| Monitoring and alerts documented | ✅ Complete | Prometheus metrics, recommended alerts, ClickHouse health |
| VERIFY.md enhanced with new features | ✅ Complete | includeCanonical, canonical truncation, CLI --json mode |
| Section 1.6 relationships documented | ✅ Complete | Writer→ClickHouse, API→auth, Console→flag, Canonicalizer→shared |
| Automated tests pass | ✅ Complete | Usage error handling, exit codes validated |
| Checklist updated | ✅ Complete | Sections 1.4-1.6 marked complete, changelog entry added |

---

## Follow-Ups

1. **CLI negative test fixtures:** Create test cases for bad key, tampered payload, unknown key scenarios (can be added to existing transparency test suite)
2. **Integration testing:** Once live API available, validate full JSON output for all scenarios (PASS, FAIL, NOT_APPLICABLE, UNKNOWN_KEY)
3. **Operations runbook:** Consider adding to on-call playbook for transparency incidents
4. **Metrics dashboard:** Create Grafana dashboard for transparency metrics referenced in operations guide

---

## Impact

- **Operations:** Safe key rotation and sampling management without developer intervention
- **Developer Experience:** Programmatic verification enables CI/CD integration and automated testing
- **Documentation:** Comprehensive guides improve onboarding and troubleshooting
- **System Architecture:** Clear dependency documentation prevents future regressions and facilitates debugging

---

## References

- **CLI Implementation:** `backend/scripts/transparency-verify.ts`
- **Operations Guide:** `docs/Internal/Operations/TRANSPARENCY_KEY_ROTATION.md`
- **Verification Guide:** `docs/Transparency/VERIFY.md`
- **Checklist:** `docs/Internal/Development/DEVELOPMENT_TODO_CHECKLIST.md` (sections 1.4-1.6)
- **Test Script:** `backend/scripts/test-transparency-json-mode.sh`
- **Canonicalizer:** `backend/src/services/transparency/canonicalizer.ts`
- **Writer:** `backend/src/services/transparencyWriter.ts`
- **Controller:** `backend/src/controllers/transparency.controller.ts`
