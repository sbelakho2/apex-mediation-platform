# Android SDK Integration

## Quick Start

### 1. Add Dependencies

Add the ApexMediation repository and dependency to your `build.gradle` (app level):

```groovy
repositories {
    mavenCentral()
    maven { url "https://repo.apexmediation.com/android" }
}

dependencies {
    implementation 'com.apexmediation.sdk:core:1.0.0'
    // Add adapters for your BYO networks
    implementation 'com.apexmediation.sdk:adapter-admob:1.0.0'
    implementation 'com.apexmediation.sdk:adapter-applovin:1.0.0'
}
```

### 2. Initialize SDK

In your `Application` class or main `Activity`:

```kotlin
import com.apexmediation.sdk.ApexMediation

class MyApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        
        ApexMediation.initialize(this, "YOUR_APP_ID") { status ->
            if (status == InitializationStatus.SUCCESS) {
                Log.d("Apex", "SDK Initialized")
            }
        }
    }
}
```

### 3. Load & Show Ad

```kotlin
// Load
ApexMediation.loadInterstitial("PLACEMENT_ID")

// Show
if (ApexMediation.isInterstitialReady("PLACEMENT_ID")) {
    ApexMediation.showInterstitial(this, "PLACEMENT_ID")
}
```

## Key Concepts

*   **App ID**: Found in the Console under App Settings. Unique per app.
*   **Placement ID**: Found in the Console. Unique per ad unit.
*   **Activity Context**: Always pass the current `Activity` when showing ads to ensure proper rendering.

## Integration Checklist

1.  [ ] Added `internet` permission to `AndroidManifest.xml` (usually auto-merged).
2.  [ ] Configured ProGuard rules (see below).
3.  [ ] Initialized SDK with correct App ID.
4.  [ ] Added adapters for all networks you plan to use.
5.  [ ] Verified test ads load in the emulator.

## ProGuard / R8

If you use code shrinking, add these rules to `proguard-rules.pro`:

```proguard
-keep class com.apexmediation.sdk.** { *; }
-keep interface com.apexmediation.sdk.** { *; }
```

## Debugging

Enable verbose logging during development:

```kotlin
ApexMediation.setLogLevel(LogLevel.VERBOSE)
```

Open the **Mediation Debugger** to see adapter status:

```kotlin
ApexMediation.openDebugger(this)
```
