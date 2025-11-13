Supported Ad Networks Across SDKs (15)

Overview
- This document lists the 15 ad network adapters supported across all SDKs and where their code lives.
- Networks:
  1. AdMob
  2. AppLovin
  3. Unity Ads
  4. IronSource
  5. Facebook (Meta Audience Network)
  6. Vungle
  7. Chartboost
  8. Pangle
  9. Mintegral
  10. AdColony
  11. Tapjoy
  12. InMobi
  13. Fyber
  14. Smaato
  15. Amazon Publisher Services

Android (core)
- Discovery via reflection in: sdk/core/android/src/main/kotlin/adapter/AdapterRegistry.kt
- Adapter implementations (one per network):
  - sdk/core/android/src/main/kotlin/com/rivalapexmediation/adapter/<network>/Adapter.kt
  - Present for: admob, applovin, unity, ironsource, facebook, vungle, chartboost, pangle, mintegral, adcolony, tapjoy, inmobi, fyber, smaato, amazon

iOS / tvOS
- Registry: sdk/core/ios/Sources/Adapter/AdapterRegistry.swift (registerBuiltInAdapters)
- Adapter implementations:
  - Built-in classes under sdk/core/ios/Sources/Adapter/
  - Additional stubs: sdk/core/ios/Sources/Adapter/StubAdapters.swift
  - Registered for all 15 networks listed above

Android TV (CTV)
- Registry and stubs (metadata-only):
  - sdk/ctv/android-tv/src/main/kotlin/com/rivalapexmediation/ctv/adapter/Adapters.kt
  - CtvAdapterRegistry exposes all 15 network names

Unity
- Registry and stubs (metadata-only):
  - Packages/com.rivalapexmediation.sdk/Runtime/Adapters/IAdapter.cs
  - Packages/com.rivalapexmediation.sdk/Runtime/Adapters/BaseStubAdapter.cs
  - Packages/com.rivalapexmediation.sdk/Runtime/Adapters/AdapterRegistry.cs
  - AdapterRegistry exposes all 15 network names

Web SDK
- Supported networks list exposed via API:
  - packages/web-sdk/src/adapters.ts (SUPPORTED_NETWORKS)
  - Re-exported from packages/web-sdk/src/index.ts

Notes
- Current adapters for third-party networks are minimal stubs suitable for sandbox testing. Production integrations will replace stubs with vendor SDK bridges and full feature support.
- Naming convention for Android package paths: com.rivalapexmediation.adapter.<network>
- For iOS/tvOS, the registry registers Swift types by network name.
