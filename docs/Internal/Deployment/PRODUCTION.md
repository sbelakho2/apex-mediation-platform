1. Network Credential Vault - MISSING
Status: Referenced in ADR-SB-05 but does not exist
Impact: BLOCKER for BYO model
Required: backend/src/services/networkCredentialVault.ts needs to be implemented
Purpose: Store long-lived network credentials separately from SDKs/adapters
2. Business Model & Billing (Section 1) - 0/10 Complete
All billing items unchecked:

❌ Fee models (SaaS, usage, % of Net) - not fully implemented
❌ FX normalization source wiring
❌ Network report ingestion (CSV/API) for Net Ad Revenue
❌ Daily fee accruals widget
❌ Invoice generation + auto-debit + dunning
❌ Grace period and throttle/suspend policies
❌ Month-end close (T+7/T+15)
❌ Billing audit trail
❌ Legal templates (MSA, DPA, Transparency Addendum)
3. Migration Studio (Section 2) - 0/10 Complete
Critical for customer onboarding:

❌ Unity/MAX/LevelPlay import
❌ Mapping UI with conflict detection
❌ Parity simulator
❌ Shadow-mode cutover
❌ Staged rollout with auto-rollback
❌ app-ads.txt generator
❌ iOS SKAN/AAK validation
4. Cryptographic Transparency (Section 3) - 0/10 Complete
Core differentiator for BYO trust:

❌ Signed receipt schema
❌ Append-only log with hash chain
❌ Daily Merkle root computation
❌ Verification endpoints
❌ Ed25519 key management
❌ Async signer implementation
5. Adapters Implementation (Sections 5-10) - 0/10 Complete Each
❌ No long-lived credentials in adapters (not enforced)
❌ Standard interface not implemented across adapters
❌ Circuit breakers not implemented
❌ OTA config system not complete
❌ SDK consent propagation incomplete
❌ Android/iOS/Unity/Web/CTV SDKs all have gaps
