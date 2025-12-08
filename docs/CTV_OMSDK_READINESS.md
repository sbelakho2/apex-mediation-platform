# CTV OM SDK / Attestation Readiness

Current state (2025-12-08):
- No CTV OM SDK integration is shipped today; the SDK does **not** load or link any CTV OMID binaries.
- Placeholder feature flag only: `features.ctv_om_sdk` (reserved) so Console/Config can surface "Planned / Not active" without behavioral impact.
- Device attestation (IAB/OMID for CTV) is under vendor evaluation; do not enable until standards and major vendors converge.

Planned shape (once vendor support lands):
- Mirror mobile `OmSdkHelper` design: runtime detection via reflection, start/finish per impression, and friendly-obstruction guards.
- Config-guarded rollout with safe no-op when OM SDK is absent on device images.
- Console surfacing: "CTV OM SDK planned" toggle + health counters (`missing_sdk`, `disabled_by_config`, `enabled`).

Publisher guidance (now):
- No action needed; OM SDK is disabled for CTV by default.
- If a partner supplies a CTV OMID/attestation binary, keep it sandboxed and do **not** wire into production until the flag is promoted.

What to monitor:
- Vendor roadmap for CTV OMID/device attestation.
- SDK size and startup impact once binaries are evaluated.
- Crash/ANR regressions when toggling the future flag in controlled betas.
