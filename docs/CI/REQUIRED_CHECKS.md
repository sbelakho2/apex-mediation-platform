Required PR Checks and CI Artifacts

Overview
- The following GitHub Actions workflows must run and pass on all Pull Requests touching the respective areas. Configure these as required checks in branch protection settings.

Workflows and required artifacts
- Android SDK: .github/workflows/android-sdk.yml
  - Required checks: Android SDK CI
  - Artifacts: android-apexmediation-aar, android-sdk-size-report, android-api-docs-html
- iOS SDK: .github/workflows/ios-sdk.yml
  - Required checks: iOS/tvOS Tests, iOS Docs
  - Artifacts: ios-xcodebuild-logs-ios, ios-xcodebuild-logs-tvos, ios-xcresult-ios, ios-xcresult-tvos, ios-sdk-docs
- Unity SDK: .github/workflows/unity-sdk.yml
  - Required checks: Test Unity SDK (matrix), Build Unity SDK (matrix), Package Unity SDK
  - Artifacts: test-results-<unityVersion>, build-<platform>, unity-package
- Web SDK: .github/workflows/web-sdk.yml
  - Required checks: Web SDK CI
  - Artifacts: web-sdk-dist, web-sdk-coverage, web-sdk-mock-trace
- Android TV (CTV): .github/workflows/ctv-android.yml
  - Required checks: Android TV (CTV) CI
  - Artifacts: ctv-android-aar, ctv-android-size-report, ctv-android-test-results

Notes
- Names above correspond to uploaded artifact names; verify they appear on each run.
- If API baselines (api/) are missing on first run for Android modules, apiDump will generate them; commit api/ for strict gating.
