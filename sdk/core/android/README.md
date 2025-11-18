# Android SDK

_Last updated: 2025-11-18_

> **FIX-10 governance:** This README documents Android SDK capabilities and integration. For SDK backlog and production readiness, see `docs/Internal/Deployment/PROJECT_STATUS.md` and `docs/Internal/Development/FIXES.md` (FIX-05).

Thread-safe, ANR-proof ad mediation SDK for Android.

## Features

- ✅ **<500KB Size**: Minimal footprint
- ✅ **Thread-Safe**: All network I/O on background threads
- ✅ **ANR Prevention**: StrictMode enforcement, <0.02% contribution
- ✅ **Circuit Breakers**: Per-adapter fault tolerance
- ✅ **Crash Protection**: Comprehensive error handling

## Requirements

- Android API 21+ (Lollipop)
- Kotlin 1.9+
- AndroidX

## Installation

### Gradle

```gradle
dependencies {
    implementation 'com.rivalapexmediation:sdk:0.1.0'
}
```

### Maven

```xml
<dependency>
    <groupId>com.rivalapexmediation</groupId>
    <artifactId>sdk</artifactId>
    <version>0.1.0</version>
</dependency>
```

## Quick Start

### 1. Initialize SDK

```kotlin
class MyApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        
        // Initialize SDK
        MediationSDK.initialize(
            context = this,
            appId = "your_app_id",
            config = SDKConfig.Builder()
                .testMode(BuildConfig.DEBUG)
                .logLevel(LogLevel.DEBUG)
                .build()
        )
    }
}
```

### 2. Load an Ad

```kotlin
class MainActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        // Load interstitial ad
        MediationSDK.getInstance().loadAd(
            placement = "interstitial_main",
            callback = object : AdLoadCallback {
                override fun onAdLoaded(ad: Ad) {
                    // Ad loaded successfully
                    ad.show(this@MainActivity)
                }
                
                override fun onError(error: AdError, message: String) {
                    // Handle error
                    Log.e("Ad", "Failed to load: $message")
                }
            }
        )
    }
}
```

## Performance Guarantees

| Metric | Target | Implementation |
|--------|--------|----------------|
| SDK Size | <500KB | Modular adapters, ProGuard |
| Cold Start | <100ms | Lazy initialization |
| ANR Rate | <0.02% | Background executors |
| Memory | <10MB | Efficient caching |

## Thread Safety

All SDK operations are thread-safe:

```kotlin
// Safe to call from any thread
MediationSDK.getInstance().loadAd("placement") { ad ->
    // Callback always on main thread
}
```

### StrictMode Integration

In debug builds, the SDK enforces StrictMode to catch threading violations:

```kotlin
if (BuildConfig.DEBUG) {
    // SDK automatically enables StrictMode
    // Crashes immediately on main thread violations
}
```

## Advanced Configuration

### Circuit Breakers

Automatic fault tolerance per adapter:

```kotlin
val config = SDKConfig.Builder()
    .circuitBreakerThreshold(5)  // Fail after 5 errors
    .circuitBreakerResetTimeoutMs(60000) // Reset after 60s
    .circuitBreakerHalfOpenAttempts(2) // Require 2 successes to close
    .build()
```

### Telemetry

```kotlin
val config = SDKConfig.Builder()
    .telemetryEnabled(true)
    .telemetryEndpoint("https://telemetry.rivalapexmediation.com")
    .build()
```

## Debugging

### Enable Verbose Logging

```kotlin
val config = SDKConfig.Builder()
    .logLevel(LogLevel.VERBOSE)
    .build()
```

### Test Mode

```kotlin
val config = SDKConfig.Builder()
    .testMode(true)  // Use test ads
    .build()
```

## ProGuard Rules

```proguard
# Keep SDK public API
-keep class com.rivalapexmediation.sdk.** { *; }
-dontwarn com.rivalapexmediation.sdk.internal.**
```

## Migration from Unity

See [Migration Guide](../../docs/migration/unity-to-rivalapexmediation.md)

## Support

- Documentation: https://docs.rivalapexmediation.com
- Discord: https://discord.gg/rival-ad-stack
- Email: support@rivalapexmediation.com
