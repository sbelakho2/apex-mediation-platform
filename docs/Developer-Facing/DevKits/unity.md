### Unity Adapter Dev Kit (BYO-first)

Purpose
- Enable Unity teams to validate adapter compatibility without bundling vendor Unity SDKs into the ApexMediation Unity core package.

Key guarantees
- Unity core never ships vendor SDKs. BYO adapters live in your project/packages.
- Single-point entry and simple consent are preserved across platforms.
- Sandbox/test logic is optional and separate from Release builds.

Unity architecture options
1) Native-based adapters (recommended)
   - Keep adapters in native iOS/Android modules (BYO) that implement the platform adapter interfaces.
   - Unity calls the native Apex core via the C# bridge; no vendor Unity SDK references needed.
2) Unity-level adapters
   - Provide a C# `INetworkAdapter` wrapper that calls vendor Unity SDK APIs.
   - Still BYO: vendors are added to your project separately.

Single entry and consent (C#)
```csharp
SdkBridge.Initialize("your-app-id", testMode: true);
SdkBridge.SetConsent(new ConsentPayload {
  gdprApplies = true,
  tcfString = "<TCF>",
  usPrivacy = "1---",
  coppa = false,
  limitAdTracking = false
});
```

Sandbox controls (for testing only)
```csharp
SdkBridge.SetSandboxForceAdapterPipeline(true);
SdkBridge.SetSandboxAdapterWhitelist(new [] { "admob" });
```

BYO registration patterns
- Native-based: register adapters in your iOS/Android modules using the platform APIs (Swift/Kotlin) before `initialize`, then use Unity as UI/logic shell.
- Unity-level: expose a simple registration in C# to your own adapter wrappers (optional pattern).

Batchmode test example
```bash
/Applications/Unity/Hub/Editor/<version>/Unity \
  -batchmode -projectPath "Test Apps/unity/ApexSandboxUnity" \
  -runTests -testResults unity-tests.xml -quit
```

Release safety
- The Unity core package references only the Apex native cores and your own app code. No vendor Unity SDKs are included by default.
- Sandbox flags are no-ops in Release; use them for DEBUG/testing only.

Links
- Core guide: `docs/Developer-Facing/AdapterDevKit.md`
- Android Dev Kit: `docs/Developer-Facing/DevKits/android-androidtv.md`
- iOS/tvOS Dev Kit: `docs/Developer-Facing/DevKits/ios-tvos.md`
