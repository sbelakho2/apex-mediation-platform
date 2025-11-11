Apex Mediation CTV/OTT SDK (Baseline)

This folder contains baseline scaffolding for Connected TV (CTV/OTT) SDKs targeting Android TV and tvOS, designed to progress toward parity with our mobile SDKs. It includes initialization stubs, consent handling placeholders, and notes for S2S auction and creative rendering.

Components
- android-tv: Android Library module (Kotlin) suitable for Android TV/Fire TV.
- tvos: Swift Package (SPM) skeleton for tvOS apps.

Status — 2025-11-11
- Initialization and consent stubs defined.
- Build gates: R8 enabled in release, soft size budget warning (~1MB) for TV.
- Demo guidance: use platform-native video/image components for creative rendering.

Next steps
- Implement S2S AuctionClient mirroring mobile SDKs.
- Add consent propagation and telemetry.
- Add CI lanes for Android TV and tvOS with basic unit tests.