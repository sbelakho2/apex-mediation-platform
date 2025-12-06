# Unity SDK - Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2025-11-11

### Added
- Initial release of Apex Mediation Unity SDK
- UPM package structure compatible with Unity 2020.3 LTS and later
- Platform abstraction layer supporting iOS, Android, WebGL, and Standalone
- iOS native plugin for IDFA/ATT support
- Complete ad format implementations:
  - Interstitial ads with TTL expiry
  - Rewarded ads with completion callbacks
  - Banner ads (320x50, 300x250, 728x90, adaptive)
  - Rewarded Interstitial ads with skip countdown
- S2S auction client with UnityWebRequest
  - Exponential backoff retry for transient errors
  - HTTP status taxonomy (200/204/429/5xx/timeout)
  - Request/response timeout enforcement
- Privacy and consent management:
  - GDPR compliance with consent string persistence
  - CCPA opt-out support
  - COPPA mode for children under 13
  - PlayerPrefs persistence across sessions
- SDK initialization with:
  - ScriptableObject configuration
  - Idempotent initialization
  - DontDestroyOnLoad lifecycle
  - Main-thread callback guarantees
- Error handling with comprehensive taxonomy:
  - NO_FILL, TIMEOUT, NETWORK_ERROR, RATE_LIMIT
  - INVALID_PLACEMENT, AD_EXPIRED, NOT_INITIALIZED
  - INVALID_API_KEY, CREATIVE_ERROR, INTERNAL_ERROR
- Developer tools:
  - Integration Validator editor window
  - Custom SDKConfig Inspector with validation
  - Debug info API for diagnostics
  - PII-safe logging with redaction
- Testing:
  - 25+ Edit Mode unit tests
  - Play Mode integration tests
  - NUnit framework integration
- Documentation:
  - Complete integration guide with examples
  - API reference and quick reference
  - Implementation summary with status
  - Sample integration scene with all ad formats

### Technical Details
- Package size: ~150KB DLL (50% of 300KB budget)
- Minimum Unity version: 2020.3 LTS
- Supported platforms: iOS 14+, Android API 21+, WebGL, Standalone
- Zero external dependencies (uses Unity built-in APIs only)

### Known Limitations
- Creative rendering is mock implementation (logs creative URLs, no actual display)
- OTA config not yet implemented (uses local SDKConfig only)
- IAB TCF consent string stored but not parsed
- Editor tools: Debug panel window not yet implemented (GetDebugInfo() available)

## [Unreleased]

### Planned for 1.1.0 (Beta)
- Image creative rendering with UnityWebRequestTexture
- Video creative playback with VideoPlayer
- OTA config fetch with Ed25519 signature verification
- Runtime Debug Panel window (IMGUI/UIToolkit)
- IAB TCF consent string parsing
- Play Mode performance profiling tests

### Planned for 1.2.0
- HTML creative support (WebView integration)
- App Open Ads format
- CI/CD pipeline with multi-version Unity matrix
- Advanced Editor tools and diagnostics
- Performance optimization and allocation budgets

---

For support, please visit [https://apexmediation.ee/docs](https://apexmediation.ee/docs) or email sdk-support@apexmediation.ee
