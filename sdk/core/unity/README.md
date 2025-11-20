Platform Unity package (UPM) — Mediation

_Last updated: 2025-11-18_

> **FIX-10 governance:** This README documents Unity SDK scaffolding. For SDK backlog and production readiness, see `docs/Internal/Deployment/PROJECT_STATUS.md` and `docs/Internal/Development/FIXES.md` (FIX-05).

This folder now contains the Unity BYO Mediation SDK surface that mirrors the Android/iOS runtime:

### Highlights
- Runtime asmdef (`Runtime/ApexMediation.asmdef`) with public facade (`Runtime/ApexMediation.cs`).
- Consent manager with explicit setters and optional auto-read from PlayerPrefs/NSUserDefaults.
- BYO credential provider, zero-trust logging, and per-network config injection.
- Platform bridges for Android (JNI) and iOS (P/Invoke) plus editor-safe mock bridge.
- OMSDK-friendly banner host component and IL2CPP-safe callback pump.
- Editor tooling: credential wizard with validation, Mediation Manager (search, diagnostics), Migration Studio, and app-ads.txt inspector.
- Samples (`Samples~/MediationDemo`) showing initialization and ad flow.
- Config-as-Code utilities (HMAC signed export/import) and cryptographic transparency proofs for selection logs.

### Trying the SDK
1. Open Unity 2020.3+.
2. In Package Manager choose “Add package from disk” and select this folder.
3. Import the “Mediation Demo” sample from Package Manager UI.
4. Open the sample scene, hit Play, and use the buttons to load/show mock ads.

### Development
- Runtime logic lives in `Runtime/` with platform-specific bridges under `Runtime/Platforms`.
- Editor utilities (credential wizard, manager + inspectors, migration studio, diagnostics) live in `Editor/`.
- Tests reside under `Tests/` and can be executed with `dotnet test Tests/ApexMediation.Tests.csproj`.
- Automated constraints: run `scripts/check_package_constraints.sh` to enforce runtime size (<100KB) and execute the unit suite.

Please keep vendor adapters outside this core package—publishers bring their own SDKs in BYO mode.
