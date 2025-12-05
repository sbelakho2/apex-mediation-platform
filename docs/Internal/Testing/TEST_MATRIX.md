# Test Matrix – December 2025

This file enumerates every code surface that must be kept green before production cutover. Keep it updated when adding packages, adapters, or apps so we always know which commands to run and which prerequisites are required.

## 1. Backend + Console Workspaces

| Area | Command | Notes |
| --- | --- | --- |
| Backend API (`backend/`) | `npm run test --prefix backend` | Runs all Jest suites (unit + integration stubs). `npm run test:db` spins Postgres/Redis locally; use when DB-dependent tests need coverage. |
| Transparency/ops scripts | `npm run scripts:test --prefix backend` (per-script Jest targets under `scripts/__tests__`) | Already covered by default Jest config but keep in mind when adding new scripts. |
| Console (`console/`) | `npm run test --prefix console` | Executes `next lint`, design-token verifier, then Jest+RTL+MSW suites. Playwright e2e and Lighthouse are additional manual targets (`npm run e2e`, `npm run lighthouse`). |
| Root workspaces | `npm test` (at repo root) | Fan-out command used in CI to run every workspace’s `test` script. Useful smoke after mass changes. |

## 2. JavaScript/TypeScript SDK Packages

| Package | Command | Notes |
| --- | --- | --- |
| Web SDK (`Packages/web-sdk`) | `npm run test` | Requires MSW dev dependency; run `npm install --legacy-peer-deps --package-lock=false` beforehand when working locally without a lockfile. |
| Unity UPM wrapper (`Packages/com.rivalapexmediation.sdk`) | `npm run lint` (if scripts added) + Unity package validation | No automated tests today; ensure Unity editor import succeeds. TODO: add CI hook once Unity CLI is scripted. |

## 3. Core Mobile/CTV SDKs

| Module | Command | Toolchain Requirements | Current Gaps |
| --- | --- | --- | --- |
| Android core (`sdk/core/android`) | `./gradlew.sh testDebugUnitTest strictmode-sample:testDebugUnitTest` | JDK 17, Android SDK installed, Gradle 8.7 distribution (wrapper script downloads). | Two timeout-classification tests failing (`FacadeApisTaxonomyTest`, `AuctionClientTest`). |
| Android CTV (`sdk/ctv/android-tv`) | `./gradlew testDebugUnitTest` | Same as above; needs plugin repositories declared via `pluginManagement`. | Build currently fails because publishing block references `components.release` before `singleVariant` is configured. |
| iOS core (`sdk/core/ios`) | `swift test` (or `xcodebuild -scheme RivalApexMediationSDK -destination 'platform=iOS Simulator,name=iPhone 16,OS=18.1' test`) | Xcode 16+, Swift 5.9, CryptoKit. | macOS build fails due to missing `@available` guards around `Curve25519`, `Task`, and URLSession async APIs. Need targeted availability annotations or an iOS simulator destination. |
| tvOS CTV (`sdk/ctv/tvos`) | `swift test` or `xcodebuild -scheme CTVSDK -destination 'platform=tvOS Simulator,name=Apple TV,OS=18.1' test` | Xcode 16+, StoreKit/AppTrackingTransparency frameworks. | Compilation fails on macOS host because SKAdNetwork APIs marked unavailable; add tvOS availability checks and runtime guards. |
| Unity runtime (`sdk/core/unity/Tests`) | `dotnet test` | .NET SDK 8.0.x installed locally (`dotnet-install.sh --channel 8.0`). | Passes after installing .NET 8.0.416; keep PATH updated with `~/.dotnet`. |

## 4. Sandbox/Test Applications

| App | Command | Dependencies | Notes |
| --- | --- | --- | --- |
| Web sandbox (`Test Apps/web/apex-sandbox-web`) | `npm run build` | Node ≥18, Vite 5.4.10 | Build already green. Consider adding Playwright smoke when hooking into console. |
| Android sandbox (`Test Apps/android/ApexSandboxAndroid`) | `./gradlew testDebugUnitTest` and `./gradlew connectedDebugAndroidTest` | Android Studio Iguana+, emulator API 34, pluginManagement block for AGP repo. | CLI build currently fails to locate `com.android.application` because settings.gradle lacks plugin repositories. Add `pluginManagement` with `google()`. |
| Android TV sandbox (`Test Apps/android/ApexSandboxAndroidTV`) | Same as above with tv target | Android TV emulator/API 34. | Verify gradle scripts mirror phone app once plugin repos fixed. |
| iOS sandbox (`Test Apps/ios/ApexSandboxiOS`) | `xcodebuild -workspace ApexSandboxiOS.xcworkspace -scheme ApexSandboxiOS -destination 'platform=iOS Simulator,name=iPhone 16' test` | Xcode 16+, CocoaPods (run `pod install`). | Ensure Podfile references local `sdk/ios` path. |
| tvOS sandbox (`Test Apps/tvos/ApexSandboxTVOS`) | `xcodebuild -workspace ApexSandboxTVOS.xcworkspace -scheme ApexSandboxTVOS -destination 'platform=tvOS Simulator,name=Apple TV' test` | Same as above plus tvOS simulators. | Needs same availability fixes as tvOS SDK. |
| Unity sandbox (`Test Apps/unity/ApexSandboxUnity`) | Unity Editor CLI (`/Applications/Unity/Hub/Editor/<version>/Unity -batchmode -quit -projectPath ... -runTests`) | Unity 2021 LTS+, test framework enabled. | No automated run currently; add once CLI harness configured. |

## 5. Adapter Coverage Expectations

All SDKs must ship FakeNetworkA/B/C adapters plus partner stubs listed in `docs/Adapters/SUPPORTED_NETWORKS.md`. Minimal verification per platform:

- **Android & Android TV** – Unit tests in `sdk/core/android/src/test` and `sdk/ctv/android-tv/src/test` should mock network clients for FakeNetworkA/B/C and ensure request→response mapping. Integration tests live in sandbox apps via adapter toggles.
- **iOS & tvOS** – Add XCTest targets validating adapter metadata and error translation once `swift test` compiles under simulator destinations.
- **Unity** – `sdk/core/unity/Tests` already imports runtime adapters; extend coverage for partner stubs when they land.
- **Web SDK** – `tests/web-sdk.test.ts` covers adapter registration + retry logic; extend to partner adapters when they are ported.

## 6. Suggested Execution Order

1. `npm run test --prefix backend`
2. `npm run test --prefix console`
3. `npm run test --prefix Packages/web-sdk`
4. `./sdk/core/android/gradlew.sh testDebugUnitTest strictmode-sample:testDebugUnitTest`
5. `./sdk/ctv/android-tv/gradlew testDebugUnitTest`
6. `swift test` in `sdk/core/ios` (or `xcodebuild …`)
7. `swift test` in `sdk/ctv/tvos`
8. `dotnet test sdk/core/unity/Tests`
9. Android + CTV sandbox apps (`./gradlew testDebugUnitTest` + `connectedDebugAndroidTest`)
10. iOS/tvOS sandbox apps (`xcodebuild … test`)
11. Web sandbox build (`npm run build`)

Update this document whenever new modules or adapters appear so the production-readiness checklist stays actionable.
