ADR-SB-02 — Secrets at Rest (API Keys, 2FA)
=================================================

Status: Accepted (2025-11-18)

Context
- API keys and 2FA TOTP secrets must not be stored in plaintext.
- We need rotation, auditability, and minimal blast radius if a DB snapshot is exposed.

Decision
- API keys: store only a bcrypt hash of the secret (verification) and a sha256 digest for constant-time lookup; expose prefix and last4 for display. Never return full secrets after creation/rotation.
- 2FA TOTP: encrypt with AES-256-GCM using APP_KMS_KEY. Keep legacy plaintext column nullable for backfill and remove reliance from code paths. Backup codes stored as bcrypt hashes and rotated atomically.
- Audit trails: write audit_twofa rows for enroll/enable/regen/disable. API key usage recorded in api_key_usages with route/method/ip/ua hashes and status.

Key management
- APP_KMS_KEY is required for encryption; accepts base64/hex/utf8 and derives 32-byte key if needed.
- Rotation: deploy new key, migrate secrets by re-encrypting (process to be documented in a separate runbook).

Alternatives
- External KMS (e.g., Cloud KMS) per-row envelope encryption — stronger guarantees but increases operational coupling; can be adopted later.

Consequences
- Encrypted fields are opaque to the DB; search requires app-level indexes/digests.

Validation
- 2FA flows survive restarts; ciphertext differs per record (random IV). API key verification works via digest lookup + bcrypt compare; usage/audit rows present.
