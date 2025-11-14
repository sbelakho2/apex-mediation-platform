CI Release Guide and Rollback Playbook

Overview
- This guide documents how to produce releases across all SDKs and the backend, which CI artifacts to expect, semantic versioning rules, and how to roll back safely.

Versioning policy (SemVer)
- All SDKs and backend follow Semantic Versioning: MAJOR.MINOR.PATCH.
- Breaking API changes require a MAJOR bump; new features without breaking changes use MINOR; bug fixes use PATCH.
- Each repository/package keeps a CHANGELOG.md updated per release.

Platforms and release lanes
1) Android SDK (sdk/core/android)
   - CI: .github/workflows/android-sdk.yml
   - Commands: ./gradlew :sdk:core:android:assembleRelease apiCheck dokkaHtml
   - Artifacts: android-apexmediation-aar, android-sdk-size-report, android-api-docs-html
   - Release: publish to GitHub Packages or internal Maven when tagged (future job); attach artifacts to GitHub Release.

2) iOS/tvOS SDK (sdk/core/ios)
   - CI: .github/workflows/ios-sdk.yml
   - Commands: xcodebuild clean test (iOS + tvOS); scripts/ios-docs.sh
   - Artifacts: ios-xcodebuild-logs-*, ios-xcresult-*, ios-sdk-docs (DocC/Jazzy zip)
   - Release: tag and produce XCFramework (future); attach docs to release assets.

3) Unity SDK (Packages/com.rivalapexmediation.sdk)
   - CI: .github/workflows/unity-sdk.yml
   - Commands: game-ci test runner (Edit/Play Mode) + builder matrix
   - Artifacts: test-results-<unityVersion>, build-<platform>, unity-package (.tgz)
   - Release: publish .tgz to internal registry or attach to GitHub Release.

4) Android TV (CTV) (sdk/ctv/android-tv)
   - CI: .github/workflows/ctv-android.yml
   - Commands: assembleRelease, testDebugUnitTest, checkCtvSdkSize, validateSdkConfig
   - Artifacts: ctv-android-aar, ctv-android-size-report, ctv-android-test-results
   - Release: publish AAR to internal Maven when tagged (future job).

5) Web SDK (packages/web-sdk)
   - CI: .github/workflows/web-sdk.yml
   - Commands: npm ci && npm run lint && npm run build && npm test -- --coverage && npm run docs
   - Artifacts: web-sdk-dist, web-sdk-coverage, web-sdk-mock-trace, web-sdk-typedoc
   - Release: npm publish (internal registry) on tag (future job); attach dist and docs to GitHub Release.

Documentation discoverability
- Android: Dokka HTML in artifact android-api-docs-html.
- iOS/tvOS: DocC/Jazzy zip in ios-sdk-docs; link from sdk/core/ios/README.md (todo).
- Web: Typedoc site artifact web-sdk-typedoc; link from packages/web-sdk/README.md.
- Cross-platform supported networks listed in docs/Adapters/SUPPORTED_NETWORKS.md.

Branch protections and required checks
- Configure required PR checks per docs/CI/REQUIRED_CHECKS.md before allowing merges to main.

Release steps (high level)
1. Prepare release branch; update CHANGELOG.md entries and version numbers.
2. Ensure all CI required checks pass; review artifacts.
3. Tag release (e.g., v0.2.0); push tag.
4. CI release jobs (future) or manual upload:
   - Attach built artifacts (AARs, docs zips, typedoc, unity .tgz) to GitHub Release.
   - For npm or Maven registries, run publish with appropriate tokens.

Rollback playbook
- If a release causes issues:
  1) Use feature flags to mitigate immediately (no redeploy required):
     - Kill switch: POST /api/v1/flags { "killSwitch": true } to return 503 for most routes while investigating.
     - 2FA enforcement: toggle with { "enforce2fa": true|false } to require step-up or relax temporarily.
     - Disable newly rolled-out adapters: { "disableNewAdapters": true } if applicable.
     - Reset flags to env defaults: POST /api/v1/flags/reset.
     - Get current flags: GET /api/v1/flags.
  2) Revert to previous known-good tag:
     - Android/CTV: bump version back and publish previous AAR; update distribution pointers.
     - iOS/tvOS: revert to last XCFramework; instruct integrators to pin prior version.
     - Unity: re-publish previous .tgz; update package.json dependency pin.
     - Web: unpublish (if within npm 72-hour window) or publish a yanked patch (e.g., 0.2.1) reverting changes.
  3) Update CHANGELOGs noting rollback and reason.
  4) Open postmortem with metrics and logs attached.

Evidence
- CI artifacts per workflow (listed above) on the tagged commit.
- CHANGELOG.md updated and included in the release notes.
