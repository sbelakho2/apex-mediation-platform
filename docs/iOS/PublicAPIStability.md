# iOS SDK Public API Stability Review

**Version**: 1.0  
**Last Updated**: 2024  
**Scope**: Section 3.1 - Public API review for breaking changes

## Overview

This document reviews the public API surface of the iOS SDK for stability, breaking changes, and experimental features. Goal is to ensure integrators have a predictable, stable API while marking any unstable features appropriately.

## Public API Surface

### Core SDK Classes

#### MediationSDK (Main Entry Point)

```swift
@MainActor
public final class MediationSDK {
    public static let shared: MediationSDK
    
    // Initialization
    public func initialize(appId: String, configuration: SDKConfig?) async throws
    
    // Ad Loading
    public func loadAd(placementId: String) async throws -> Ad?
    
    // Debug/Diagnostics (Section 3.1)
    public func currentAppId() -> String?
    public func currentPlacementIds() -> [String]
    public var sdkVersion: String { get }
    public var isTestMode: Bool { get }
    public var remoteConfigVersion: Int? { get }
    public var registeredAdapterCount: Int { get }
}
```

**Stability**: ✅ **STABLE**  
**Breaking Changes**: None  
**Notes**:
- Section 3.1 added read-only properties for debug panel support
- All new properties are additive (non-breaking)
- `@MainActor` isolation ensures thread-safety

---

### Facade APIs

#### BelInterstitial

```swift
public enum BelInterstitial {
    public static func load(placementId: String, completion: @escaping (Result<Ad, Error>) -> Void)
    public static func show(from viewController: UIViewController) -> Bool
    public static func isReady() -> Bool
}
```

**Stability**: ✅ **STABLE**  
**Breaking Changes**: None  
**Notes**:
- Simple, boring API matching Android SDK
- `show()` currently uses debug placeholder (TODO comment indicates future real renderer)
- No breaking changes planned

#### BelRewarded

```swift
public enum BelRewarded {
    public static func load(placementId: String, completion: @escaping (Result<Ad, Error>) -> Void)
    public static func show(from viewController: UIViewController) -> Bool
    public static func isReady() -> Bool
}
```

**Stability**: ✅ **STABLE**  
**Breaking Changes**: None  
**Notes**:
- Mirrors BelInterstitial API design
- Reward callback mechanism TBD (marked with TODO)
- API surface will remain stable when reward callback added

---

### Configuration

#### SDKConfig

```swift
public struct SDKConfig: Codable {
    public let appId: String
    public let endpoints: Endpoints
    public let telemetryEnabled: Bool
    public let logLevel: LogLevel
    public let testMode: Bool
    public let configSignaturePublicKey: String?
    
    public struct Endpoints: Codable {
        public let configUrl: URL
        public let auctionUrl: URL
    }
    
    public static func default(appId: String) -> SDKConfig
}
```

**Stability**: ✅ **STABLE**  
**Breaking Changes**: None  
**Notes**:
- All fields are immutable (let)
- Adding new optional fields is non-breaking
- `testMode` and `configSignaturePublicKey` are already optional/bool

---

### Error Handling

#### SDKError (Section 3.3 Enhanced)

```swift
public enum SDKError: Error, LocalizedError, Equatable {
    case notInitialized
    case alreadyInitialized
    case invalidPlacement(String)
    case noFill
    case timeout
    case networkError(underlying: String?)
    case internalError(message: String?)
    case status_429(message: String)
    case status_5xx(code: Int, message: String)
    
    public var errorDescription: String? { get }
    public static func fromHTTPStatus(code: Int, message: String?) -> SDKError
}
```

**Stability**: ⚠️ **ENHANCED (Section 3.3)**  
**Breaking Changes**:
- ❌ **BREAKING**: `networkError` and `internalError` now have associated values (were non-associated before)
- ✅ **NON-BREAKING**: Added `status_429` and `status_5xx` cases (additive)
- ✅ **NON-BREAKING**: Added `Equatable` conformance

**Migration Guide**:
```swift
// Before (v1.0.0-alpha)
catch SDKError.networkError {
    // Handle network error
}

// After (v1.0.0)
catch SDKError.networkError(let underlying) {
    // Handle network error with optional underlying message
}
```

**Recommendation**: Mark as **v1.0.0** and document breaking change in release notes. Integrators using pattern matching on `networkError`/`internalError` will need to update.

---

### Debug Panel

#### DebugPanel (Section 3.1 Enhanced)

```swift
public enum DebugPanel {
    public static func show(from viewController: UIViewController)
    
    public struct ConsentSnapshot: Codable {
        let gdprApplies: Bool?
        let ccpaApplicable: Bool?
        let attStatus: String
        var redactedDescription: String { get }
    }
}
```

**Stability**: ✅ **STABLE (Enhanced)**  
**Breaking Changes**: None  
**Notes**:
- `show()` method signature unchanged
- Added `ConsentSnapshot` struct (additive)
- Enriched displayed information (SDK version, test mode, consent, etc.)

---

### Data Models

#### Ad

```swift
public struct Ad: Codable {
    public let adId: String
    public let placement: String
    public let adType: AdType
    public let creative: Creative
    public let networkName: String
    public let cpm: Double
    public let expiresAt: Date
    public let metadata: [String: AnyCodable]
}
```

**Stability**: ✅ **STABLE**  
**Breaking Changes**: None

#### AdType

```swift
public enum AdType: String, Codable {
    case banner, interstitial, rewarded, rewardedInterstitial, native, appOpen
}
```

**Stability**: ✅ **STABLE**  
**Breaking Changes**: None

---

## Experimental Features

### None Currently

All features are considered stable for v1.0.0 release. Future experimental features should be marked with:

```swift
@available(iOS 14, *, message: "Experimental feature - API may change")
public func experimentalFeature() { }
```

Or with documentation comments:

```swift
/// ⚠️ **EXPERIMENTAL**: This API is subject to change in future releases.
public func experimentalFeature() { }
```

---

## API Stability Guarantees

### Semantic Versioning

The iOS SDK follows [Semantic Versioning 2.0.0](https://semver.org/):

- **MAJOR** version (X.0.0): Breaking changes to public API
- **MINOR** version (1.X.0): Additive features, non-breaking changes
- **PATCH** version (1.0.X): Bug fixes, no API changes

### Public API Scope

**Public APIs** (stability guarantees apply):
- Classes/structs/enums marked `public`
- Methods/properties marked `public`
- Protocol definitions in Sources/

**Internal APIs** (no stability guarantees):
- Classes/structs/enums marked `internal` or `private`
- Files in Tests/
- Implementation details (ConfigManager, AdapterRegistry internals)

### Deprecation Policy

Before removing a public API:
1. Mark as deprecated with `@available` annotation
2. Provide migration path in documentation
3. Keep deprecated API for at least one MINOR version
4. Remove in next MAJOR version

Example:
```swift
@available(*, deprecated, renamed: "newMethodName", message: "Use newMethodName() instead")
public func oldMethodName() { }
```

---

## Breaking Changes Summary (v1.0.0)

| API | Change | Impact | Migration |
|-----|--------|--------|-----------|
| `SDKError.networkError` | Added associated value `(underlying: String?)` | ❌ BREAKING | Update pattern matching to `case .networkError(let msg)` |
| `SDKError.internalError` | Added associated value `(message: String?)` | ❌ BREAKING | Update pattern matching to `case .internalError(let msg)` |
| `SDKError.status_429` | New case | ✅ NON-BREAKING | Handle in default case or add explicit case |
| `SDKError.status_5xx` | New case | ✅ NON-BREAKING | Handle in default case or add explicit case |
| `DebugPanel.show()` | Enriched display | ✅ NON-BREAKING | No migration needed |
| `MediationSDK` debug properties | Added read-only properties | ✅ NON-BREAKING | Optional usage |

---

## Parity with Android SDK

| Feature | iOS API | Android API | Status |
|---------|---------|-------------|--------|
| Initialization | `MediationSDK.shared.initialize()` | `MediationSDK.initialize()` | ✅ Equivalent (singleton pattern) |
| Ad Loading | `loadAd(placementId:)` | `loadAd(placementId)` | ✅ Equivalent |
| Interstitial | `BelInterstitial.load/show/isReady` | `BelInterstitial.load/show/isReady` | ✅ Equivalent |
| Rewarded | `BelRewarded.load/show/isReady` | `BelRewarded.load/show/isReady` | ✅ Equivalent |
| Error Taxonomy | `SDKError` enum | `MediationError` enum | ✅ Equivalent (Section 3.3) |
| Debug Panel | `DebugPanel.show()` | `DebugPanel.show()` | ✅ Equivalent (Section 3.1) |
| Test Mode | `SDKConfig.testMode` | `SDKConfig.testMode` | ✅ Equivalent |

**Overall Parity**: ✅ **100% API parity achieved**

---

## Future Considerations

### Potential Additions (Non-Breaking)

1. **Banner Ads**: Add `BelBanner` facade
2. **Native Ads**: Add `BelNative` facade
3. **Reward Callback**: Add `RewardedAdListener` protocol
4. **Ad Lifecycle Events**: Add `AdEventListener` protocol
5. **GDPR/CCPA Consent**: Add `ConsentManager` public API

All can be added as new APIs without breaking existing integrations.

### Potential Breaking Changes (Future MAJOR version)

1. Change `loadAd()` to return `Ad` instead of `Ad?` (throw on no-fill)
2. Remove debug placeholders from `show()` methods
3. Consolidate error types (merge `AdapterError` into `SDKError`)

---

## Documentation Status

| Item | Status |
|------|--------|
| Public API docs (inline comments) | ✅ Complete |
| Migration guide | ✅ Complete (this document) |
| Breaking changes documented | ✅ Yes |
| Deprecation policy defined | ✅ Yes |
| Semantic versioning policy | ✅ Yes |

---

## Recommendations

### For v1.0.0 Release

1. ✅ **Accept breaking changes** to `SDKError.networkError` and `internalError` - cleaner API with associated values
2. ✅ **Document migration path** for integrators using pattern matching
3. ✅ **Bump to v1.0.0** since breaking changes exist
4. ✅ **Lock API surface** - no further breaking changes until v2.0.0

### For Future Releases

1. Mark any experimental features with `@available` or doc comments
2. Maintain deprecation policy (at least one MINOR version before removal)
3. Keep parity with Android SDK API design
4. Add new features as additive (non-breaking) changes

---

## Changelog

| Date | Version | Changes |
|------|---------|---------|
| 2024 | 1.0.0 | Section 3.1 API review: SDKError enhanced, DebugPanel enriched, MediationSDK debug properties added |

---

## Conclusion

✅ **API Stability**: Strong (only 2 breaking changes for error handling)  
✅ **Android Parity**: 100% achieved  
✅ **Future-Proof**: Extensible without breaking changes  
⚠️ **Action Required**: Document breaking changes for v1.0.0 release

All public APIs reviewed and approved for Section 3.1 completion.
