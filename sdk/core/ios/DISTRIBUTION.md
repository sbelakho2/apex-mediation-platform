# iOS SDK Distribution Strategy

**Status**: Active  
**Last Updated**: November 2025

---

## Distribution Method: Swift Package Manager (SPM) Only

### Decision

The Rival Apex Mediation iOS SDK is distributed **exclusively via Swift Package Manager (SPM)**.

**Rationale:**
- Native Swift codebase with no Objective-C interop requirements
- SPM is the standard Apple-recommended distribution method for Swift packages
- Eliminates complexity of maintaining multiple distribution formats
- Automatic dependency resolution and version management
- Seamless Xcode integration (File → Add Package Dependencies)
- Supports iOS 14+ and tvOS 14+ deployment targets

### No XCFramework Distribution

We **do not** distribute pre-built XCFramework binaries for the following reasons:

1. **Source transparency**: Developers can audit the full SDK source code
2. **Build optimization**: Xcode optimizes the SDK for the specific app target
3. **Dependency management**: SPM handles transitive dependencies automatically (Alamofire, SwiftProtobuf, Swift Crypto)
4. **Reduced maintenance**: Single distribution path simplifies CI/CD and releases
5. **Modern tooling**: XCFrameworks are primarily for closed-source or Objective-C libraries

### Package Repository

**GitHub Repository**: `https://github.com/sbelakho2/Ad-Project`  
**Package Name**: `RivalApexMediationSDK`  
**Import Path**: `import RivalApexMediationSDK`

### Integration

#### Xcode (Recommended)
1. Open your project in Xcode
2. File → Add Package Dependencies
3. Enter repository URL: `https://github.com/sbelakho2/Ad-Project`
4. Select version rule (e.g., "Up to Next Major: 1.0.0")
5. Add `RivalApexMediationSDK` to your target

#### Package.swift (For SPM Projects)
```swift
dependencies: [
    .package(url: "https://github.com/sbelakho2/Ad-Project", from: "1.0.0")
],
targets: [
    .target(
        name: "YourApp",
        dependencies: [
            .product(name: "RivalApexMediationSDK", package: "Ad-Project")
        ]
    )
]
```

---

## Versioning

### Semantic Versioning

The SDK follows [Semantic Versioning 2.0.0](https://semver.org/):

- **Major (X.0.0)**: Breaking API changes
- **Minor (x.Y.0)**: New features, backward-compatible
- **Patch (x.y.Z)**: Bug fixes, backward-compatible

### Git Tags

Release versions are tagged in Git with the format `v{version}`:
- `v1.0.0` — Initial stable release
- `v1.1.0` — Feature addition
- `v1.1.1` — Patch fix

### Package.swift Version

The `Package.swift` does not specify a version — it's determined by Git tags. Consumers specify version requirements when adding the dependency.

---

## Platform Support

| Platform | Minimum Version | Architectures |
|----------|----------------|---------------|
| iOS      | 14.0           | arm64, x86_64 (simulator) |
| tvOS     | 14.0           | arm64, x86_64 (simulator) |

**Note**: macOS and watchOS are not supported.

---

## Dependencies

The SDK depends on the following Swift packages (managed automatically by SPM):

1. **Alamofire** (`~> 5.8.0`) — HTTP networking
2. **SwiftProtobuf** (`~> 1.25.0`) — Protobuf serialization
3. **Swift Crypto** (`~> 3.0.0`) — Cryptographic operations

All dependencies are fetched and built automatically when the package is resolved.

---

## Build Variants

### Debug
- Full logging and assertions enabled
- No optimization (`-Onone`)
- Symbol visibility: public

### Release
- Minimal logging (errors only)
- Optimization level: `-O` (default Swift optimization)
- Symbol visibility: public (for crash reporting)
- Dead code elimination enabled

---

## API Stability

### Public API

Only types, functions, and properties marked with `public` or `open` access control are considered stable public API. Changes to public API follow semantic versioning:

- **Breaking changes**: Require major version bump (e.g., 1.x → 2.0)
- **Additions**: Minor version bump (e.g., 1.0 → 1.1)
- **Internal changes**: Patch version bump (e.g., 1.0.0 → 1.0.1)

### Internal API

Types marked `internal` or `private` are not part of the public API and may change without notice in any release.

### Experimental Features

Features marked with `@available(*, deprecated, message: "Experimental")` or documented as experimental may change or be removed in minor releases.

---

## CI/CD Integration

### Automated Checks (Per Commit)

- **Build**: `swift build` for iOS and tvOS targets
- **Test**: `swift test` (unit tests with mocked networking)
- **API Compatibility**: Swift API Digester (detects breaking changes)

### Release Process

1. Update `CHANGELOG.md` with release notes
2. Create Git tag: `git tag v1.x.x`
3. Push tag: `git push origin v1.x.x`
4. GitHub Actions automatically:
   - Validates build for all platforms
   - Generates DocC documentation
   - Creates GitHub Release with artifacts

### Documentation

DocC documentation is generated on every CI run and attached as a build artifact. For releases, docs are published to GitHub Pages or bundled with the release.

---

## Migration from XCFramework (If Needed)

If future requirements demand XCFramework distribution (e.g., closed-source adapters), the process would be:

1. Add Xcode build script to create XCFramework:
   ```bash
   xcodebuild archive -scheme RivalApexMediationSDK -destination "generic/platform=iOS" -archivePath ./build/ios.xcarchive
   xcodebuild archive -scheme RivalApexMediationSDK -destination "generic/platform=iOS Simulator" -archivePath ./build/sim.xcarchive
   xcodebuild -create-xcframework -framework ./build/ios.xcarchive/Products/Library/Frameworks/RivalApexMediationSDK.framework -framework ./build/sim.xcarchive/Products/Library/Frameworks/RivalApexMediationSDK.framework -output ./RivalApexMediationSDK.xcframework
   ```

2. Add CI job in `.github/workflows/sdk-release.yml`:
   ```yaml
   - name: Build XCFramework
     run: ./scripts/build-xcframework.sh
   - name: Upload XCFramework to Release
     uses: actions/upload-release-asset@v1
     with:
       asset_path: ./RivalApexMediationSDK.xcframework.zip
   ```

3. Update documentation with manual integration instructions

**Current Status**: Not implemented (SPM-only distribution is sufficient).

---

## Support

- **Documentation**: `https://github.com/sbelakho2/Ad-Project/tree/main/docs/iOS`
- **Issues**: `https://github.com/sbelakho2/Ad-Project/issues`
- **Email**: `sdk-support@rivalapexmediation.com`

---

## Revision History

| Date | Version | Changes | Author |
|------|---------|---------|--------|
| 2025-11 | 1.0 | SPM-only distribution policy defined | SDK Team |
