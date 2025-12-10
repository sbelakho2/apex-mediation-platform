# Transparency Canonical Privacy Contract

Last updated: 2025-11-10
Owner: Platform Engineering

Purpose
- Define the allowed fields in the transparency canonical payload used for signing and verification.
- Ensure personally identifiable information (PII) and sensitive device identifiers are excluded or redacted.
- Provide a guardrail for future changes through documentation and unit tests.

Scope
- Applies to canonical payload constructed by the backend writer, controller, and CLI via the shared canonicalizer.
- Applies to all publishers/environments.

Guiding Principles
- Minimal necessary data: include only fields required to independently verify auction integrity.
- No direct PII: exclude direct identifiers (user IDs, device IDs, IPs, GAID/IDFA, precise geo, emails, etc.).
- Stable signatures: canonical string must be deterministically reproducible without optional/transient fields.

Approved Canonical Fields
- auction:
  - auction_id (UUID)
  - publisher_id (string) — tenant identifier, not end-user PII
  - timestamp (ISO8601 UTC)
  - winner_source (string)
  - winner_bid_ecpm (number)
  - winner_currency (string)
  - winner_reason (string)
  - sample_bps (number)
- candidates[]:
  - source (string)
  - bid_ecpm (number)
  - status (string)

Explicitly Excluded Fields (examples)
- End-user identifiers: user_id, email, phone, external_account_id
- Device identifiers: idfa, gaid, android_id, idfv, imei, mac_address
- Network: ip_address, user_agent (full string)
- Privacy strings: raw IAB TCF/US privacy strings (retain only tc_string hash in non-canonical data if needed)
- Precise geo: lat/lon, coarse or city-level geo; country code OK in non-canonical, but not required for signature
- Request metadata: headers, referrers, SDK versions, adapter counts, etc.

Redaction/Hashing Guidance
- If future requirements need including a linkage, use salted/rotated hashing with collision-resistant algorithms.
- Do NOT include raw values in canonical payloads.

Change Process
- Any change to the canonical field list must:
  1) Be reviewed by security and privacy leads.
  2) Update this contract and the VERIFY guide.
  3) Update unit tests that guard against inclusion of excluded keys.
  4) Coordinate a signer key rotation window if the change affects signature semantics.

Testing & Enforcement
- Unit test: validate that canonical payload keys are a subset of the approved set; fail on presence of excluded keys.
- E2E drift test: nightly compare CLI local verification with server verification on a sample set.

Contact
- privacy@company.example — for questions or exceptions.
