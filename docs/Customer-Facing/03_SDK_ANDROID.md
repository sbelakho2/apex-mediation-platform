# Android SDK Integration

## Quick Start

### 1. Add Dependencies

Add the repository and dependency to your `build.gradle` (app level):

```groovy
repositories {
    mavenCentral()
    maven { url "https://repo.apexmediation.com/android" }
}

dependencies {
    implementation 'com.rivalapexmediation.sdk:core:1.0.0'
    // Add adapters for your BYO networks
    implementation 'com.rivalapexmediation.sdk:adapter-admob:1.0.0'
    implementation 'com.rivalapexmediation.sdk:adapter-applovin:1.0.0'
}
```

### 2. Initialize SDK

In your `Application` class or main `Activity`. You can configure the SDK using the `SDKConfig` builder.

```kotlin
import com.rivalapexmediation.sdk.BelAds
import com.rivalapexmediation.sdk.SDKConfig
import com.rivalapexmediation.sdk.LogLevel

class MyApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        
        // Create configuration
        val config = SDKConfig.Builder()
            .appId("YOUR_APP_ID")
            .testMode(BuildConfig.DEBUG) // Enable test mode for debug builds
            .logLevel(LogLevel.INFO)
            .telemetryEnabled(true)
            .build()

        // Initialize
        BelAds.initialize(this, "YOUR_APP_ID", config)
    }
}
```

### 3. Load & Show Interstitial

Use `BelInterstitial` for interstitial ads.

```kotlin
import com.rivalapexmediation.sdk.BelInterstitial
import com.rivalapexmediation.sdk.AdLoadCallback

// Load
BelInterstitial.load(context, "PLACEMENT_ID", object : AdLoadCallback {
    override fun onAdLoaded(placementId: String) {
        Log.d("Apex", "Ad loaded for $placementId")
    }

    override fun onAdFailedToLoad(placementId: String, error: Throwable) {
        Log.e("Apex", "Ad failed: ${error.message}")
    }
})

// Show (usually in response to a user action or game event)
if (BelInterstitial.show(activity)) {
    Log.d("Apex", "Ad shown")
} else {
    Log.d("Apex", "Ad not ready")
}
```

## Advanced Configuration

The `SDKConfig.Builder` offers several advanced options:

| Option | Description | Default |
| :--- | :--- | :--- |
| `testMode(Boolean)` | Enables test ads and logging. **Disable in production.** | `false` |
| `logLevel(LogLevel)` | Sets verbosity (`NONE`, `ERROR`, `INFO`, `VERBOSE`). | `INFO` |
| `telemetryEnabled(Boolean)` | Sends anonymous performance data to improve mediation. | `true` |
| `autoConsentReadEnabled(Boolean)` | Automatically reads TCF v2 strings from SharedPreferences. | `false` |
| `observabilityEnabled(Boolean)` | Enables distributed tracing for auction latency debugging. | `true` |

## Runtime Controls

You can modify some settings at runtime via `BelAds`:

```kotlin
// Enable verbose logging for debugging
BelAds.setLogLevel(LogLevel.VERBOSE)

// Toggle test mode (e.g., via a hidden debug menu)
BelAds.setTestMode(true)

// Set Auction API Key (for Enterprise/Hybrid clients)
BelAds.setAuctionApiKey("YOUR_KEY")
```

## ProGuard / R8

If you use code shrinking, add these rules to `proguard-rules.pro`:

```proguard
-keep class com.rivalapexmediation.sdk.** { *; }
-keep interface com.rivalapexmediation.sdk.** { *; }
-keep class com.iab.omid.** { *; }
```

## Debugging

Open the **Mediation Debugger** to verify your integration and adapter status:

```kotlin
import com.rivalapexmediation.sdk.debug.DebugPanel

// Launch the debugger activity
DebugPanel.open(context)
```
