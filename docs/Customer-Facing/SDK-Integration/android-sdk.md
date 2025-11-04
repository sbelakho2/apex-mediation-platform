# Android SDK Integration Guide

Integrate ApexMediation into your Android app with Kotlin or Java.

---

## Prerequisites

- Android 5.0+ (API level 21)
- Android Studio Arctic Fox or higher
- Gradle 7.0+
- Active ApexMediation account with API credentials

---

## Installation

### Gradle (Recommended)

Add to your project-level `build.gradle`:

```gradle
buildscript {
    repositories {
        google()
        mavenCentral()
    }
}

allprojects {
    repositories {
        google()
        mavenCentral()
        maven { url 'https://maven.apexmediation.ee/releases' }
    }
}
```

Add to your app-level `build.gradle`:

```gradle
dependencies {
    implementation 'ee.apexmediation:sdk:2.0.0'

    // Required dependencies
    implementation 'com.google.android.gms:play-services-ads-identifier:18.0.1'
    implementation 'androidx.appcompat:appcompat:1.6.1'
    implementation 'androidx.recyclerview:recyclerview:1.3.2'
}
```

### Manual Installation

1. Download `apexmediation-sdk-2.0.0.aar` from [releases](https://github.com/apexmediation/android-sdk/releases)
2. Place in `app/libs/`
3. Add to `build.gradle`:

```gradle
dependencies {
    implementation files('libs/apexmediation-sdk-2.0.0.aar')
}
```

---

## Initial Setup

### 1. Configure AndroidManifest.xml

Add required permissions and configuration:

```xml
<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="com.yourapp">

    <!-- Required permissions -->
    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />

    <!-- Optional: For location-based ads (requires user permission) -->
    <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />

    <!-- Google Play Services Advertising ID -->
    <uses-permission android:name="com.google.android.gms.permission.AD_ID" />

    <application
        android:name=".MyApplication"
        android:allowBackup="true"
        android:icon="@mipmap/ic_launcher"
        android:label="@string/app_name"
        android:theme="@style/Theme.AppCompat">

        <!-- ApexMediation Configuration -->
        <meta-data
            android:name="ee.apexmediation.PUBLISHER_ID"
            android:value="YOUR_PUBLISHER_ID" />
        <meta-data
            android:name="ee.apexmediation.API_KEY"
            android:value="YOUR_API_KEY" />

        <!-- Activities and other components -->

    </application>

</manifest>
```

### 2. Initialize SDK (Kotlin)

Create or update your `Application` class:

```kotlin
import android.app.Application
import ee.apexmediation.sdk.ApexMediation
import ee.apexmediation.sdk.ApexMediationConfig
import ee.apexmediation.sdk.ApexMediationInitializationListener

class MyApplication : Application() {

    override fun onCreate() {
        super.onCreate()

        // Configure SDK
        val config = ApexMediationConfig.Builder(this)
            .setPublisherId("YOUR_PUBLISHER_ID")
            .setApiKey("YOUR_API_KEY")
            .setTestMode(true) // Remove in production!
            .setGdprConsent(true) // Set based on user consent
            .setCoppaCompliant(false) // Set true for children's apps
            .build()

        // Initialize SDK
        ApexMediation.initialize(config, object : ApexMediationInitializationListener {
            override fun onInitializationComplete(success: Boolean) {
                if (success) {
                    println("ApexMediation initialized successfully")
                } else {
                    println("ApexMediation initialization failed")
                }
            }
        })
    }
}
```

### 3. Initialize SDK (Java)

```java
import android.app.Application;
import ee.apexmediation.sdk.ApexMediation;
import ee.apexmediation.sdk.ApexMediationConfig;
import ee.apexmediation.sdk.ApexMediationInitializationListener;

public class MyApplication extends Application {

    @Override
    public void onCreate() {
        super.onCreate();

        // Configure SDK
        ApexMediationConfig config = new ApexMediationConfig.Builder(this)
            .setPublisherId("YOUR_PUBLISHER_ID")
            .setApiKey("YOUR_API_KEY")
            .setTestMode(true) // Remove in production!
            .setGdprConsent(true)
            .setCoppaCompliant(false)
            .build();

        // Initialize SDK
        ApexMediation.initialize(config, new ApexMediationInitializationListener() {
            @Override
            public void onInitializationComplete(boolean success) {
                if (success) {
                    System.out.println("ApexMediation initialized successfully");
                } else {
                    System.out.println("ApexMediation initialization failed");
                }
            }
        });
    }
}
```

---

## Ad Formats

### Banner Ads

**XML Layout:**

```xml
<LinearLayout
    xmlns:android="http://schemas.android.com/apk/res/android"
    xmlns:app="http://schemas.android.com/apk/res-auto"
    android:layout_width="match_parent"
    android:layout_height="match_parent"
    android:orientation="vertical">

    <!-- Your content -->

    <ee.apexmediation.sdk.ApexMediationBannerView
        android:id="@+id/bannerView"
        android:layout_width="wrap_content"
        android:layout_height="wrap_content"
        android:layout_gravity="center_horizontal"
        app:adSize="BANNER"
        app:placementId="banner_main" />

</LinearLayout>
```

**Kotlin Activity:**

```kotlin
import android.os.Bundle
import androidx.appcompat.app.AppCompatActivity
import ee.apexmediation.sdk.ApexMediationBannerView
import ee.apexmediation.sdk.ApexMediationBannerListener

class MainActivity : AppCompatActivity() {

    private lateinit var bannerView: ApexMediationBannerView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        // Get banner view from layout
        bannerView = findViewById(R.id.bannerView)

        // Set listener
        bannerView.setListener(object : ApexMediationBannerListener {
            override fun onBannerLoaded() {
                println("Banner loaded")
            }

            override fun onBannerFailed(error: String) {
                println("Banner failed: $error")
            }

            override fun onBannerClicked() {
                println("Banner clicked")
            }
        })

        // Load ad
        bannerView.load()
    }

    override fun onDestroy() {
        bannerView.destroy()
        super.onDestroy()
    }
}
```

**Java Activity:**

```java
import android.os.Bundle;
import androidx.appcompat.app.AppCompatActivity;
import ee.apexmediation.sdk.ApexMediationBannerView;
import ee.apexmediation.sdk.ApexMediationBannerListener;

public class MainActivity extends AppCompatActivity {

    private ApexMediationBannerView bannerView;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        // Get banner view from layout
        bannerView = findViewById(R.id.bannerView);

        // Set listener
        bannerView.setListener(new ApexMediationBannerListener() {
            @Override
            public void onBannerLoaded() {
                System.out.println("Banner loaded");
            }

            @Override
            public void onBannerFailed(String error) {
                System.out.println("Banner failed: " + error);
            }

            @Override
            public void onBannerClicked() {
                System.out.println("Banner clicked");
            }
        });

        // Load ad
        bannerView.load();
    }

    @Override
    protected void onDestroy() {
        bannerView.destroy();
        super.onDestroy();
    }
}
```

**Banner Sizes:**
- `BANNER` - 320x50
- `LARGE_BANNER` - 320x100
- `MEDIUM_RECTANGLE` - 300x250
- `LEADERBOARD` - 728x90 (tablets)

### Interstitial Ads

**Kotlin:**

```kotlin
import ee.apexmediation.sdk.ApexMediationInterstitial
import ee.apexmediation.sdk.ApexMediationInterstitialListener

class GameActivity : AppCompatActivity() {

    private var interstitial: ApexMediationInterstitial? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_game)

        loadInterstitial()
    }

    private fun loadInterstitial() {
        interstitial = ApexMediationInterstitial(this, "interstitial_level_complete")

        interstitial?.setListener(object : ApexMediationInterstitialListener {
            override fun onInterstitialLoaded() {
                println("Interstitial ready")
            }

            override fun onInterstitialFailed(error: String) {
                println("Interstitial failed: $error")
            }

            override fun onInterstitialShown() {
                println("Interstitial shown")
                // Pause game
            }

            override fun onInterstitialDismissed() {
                println("Interstitial dismissed")
                // Resume game
                loadInterstitial() // Preload next
            }
        })

        interstitial?.load()
    }

    fun showInterstitial() {
        if (interstitial?.isReady() == true) {
            interstitial?.show()
        } else {
            println("Interstitial not ready")
            loadInterstitial()
        }
    }
}
```

**Java:**

```java
import ee.apexmediation.sdk.ApexMediationInterstitial;
import ee.apexmediation.sdk.ApexMediationInterstitialListener;

public class GameActivity extends AppCompatActivity {

    private ApexMediationInterstitial interstitial;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_game);

        loadInterstitial();
    }

    private void loadInterstitial() {
        interstitial = new ApexMediationInterstitial(this, "interstitial_level_complete");

        interstitial.setListener(new ApexMediationInterstitialListener() {
            @Override
            public void onInterstitialLoaded() {
                System.out.println("Interstitial ready");
            }

            @Override
            public void onInterstitialFailed(String error) {
                System.out.println("Interstitial failed: " + error);
            }

            @Override
            public void onInterstitialShown() {
                System.out.println("Interstitial shown");
            }

            @Override
            public void onInterstitialDismissed() {
                System.out.println("Interstitial dismissed");
                loadInterstitial(); // Preload next
            }
        });

        interstitial.load();
    }

    public void showInterstitial() {
        if (interstitial != null && interstitial.isReady()) {
            interstitial.show();
        }
    }
}
```

### Rewarded Video Ads

**Kotlin:**

```kotlin
import ee.apexmediation.sdk.ApexMediationRewardedVideo
import ee.apexmediation.sdk.ApexMediationRewardedVideoListener
import ee.apexmediation.sdk.Reward

class RewardManager {

    private var rewardedVideo: ApexMediationRewardedVideo? = null

    fun loadRewardedVideo(activity: Activity) {
        rewardedVideo = ApexMediationRewardedVideo(activity, "rewarded_extra_coins")

        rewardedVideo?.setListener(object : ApexMediationRewardedVideoListener {
            override fun onRewardedVideoLoaded() {
                println("Rewarded video ready")
            }

            override fun onRewardedVideoFailed(error: String) {
                println("Rewarded video failed: $error")
            }

            override fun onRewardedVideoStarted() {
                println("User started watching")
            }

            override fun onRewardedVideoCompleted(reward: Reward) {
                println("User earned: ${reward.type} x${reward.amount}")

                // Grant reward
                when (reward.type) {
                    "coins" -> UserInventory.addCoins(reward.amount)
                    "lives" -> UserInventory.addLives(reward.amount)
                }
            }

            override fun onRewardedVideoDismissed(completed: Boolean) {
                if (completed) {
                    println("User completed video")
                } else {
                    println("User closed early - no reward")
                }

                // Preload next video
                loadRewardedVideo(activity)
            }
        })

        rewardedVideo?.load()
    }

    fun showRewardedVideo() {
        if (rewardedVideo?.isReady() == true) {
            rewardedVideo?.show()
        } else {
            // Show error message
            Toast.makeText(context, "Video not available", Toast.LENGTH_SHORT).show()
        }
    }
}
```

### Native Ads

**Kotlin:**

```kotlin
import ee.apexmediation.sdk.ApexMediationNativeAd
import ee.apexmediation.sdk.ApexMediationNativeAdListener
import ee.apexmediation.sdk.ApexMediationNativeAdLoader

class NativeAdAdapter(private val context: Context) : RecyclerView.Adapter<RecyclerView.ViewHolder>() {

    private var nativeAd: ApexMediationNativeAd? = null

    fun loadNativeAd() {
        val adLoader = ApexMediationNativeAdLoader(context, "native_feed")

        adLoader.setListener(object : ApexMediationNativeAdListener {
            override fun onNativeAdLoaded(ad: ApexMediationNativeAd) {
                nativeAd = ad
                notifyDataSetChanged()
            }

            override fun onNativeAdFailed(error: String) {
                println("Native ad failed: $error")
            }
        })

        adLoader.load()
    }

    override fun onBindViewHolder(holder: RecyclerView.ViewHolder, position: Int) {
        if (holder is NativeAdViewHolder) {
            nativeAd?.let { ad ->
                holder.titleView.text = ad.title
                holder.bodyView.text = ad.body
                holder.ctaButton.text = ad.callToAction

                // Load icon
                Glide.with(context)
                    .load(ad.iconUrl)
                    .into(holder.iconView)

                // Register views for click tracking
                ad.registerViews(
                    holder.itemView,
                    listOf(holder.ctaButton, holder.iconView)
                )
            }
        }
    }
}

class NativeAdViewHolder(view: View) : RecyclerView.ViewHolder(view) {
    val iconView: ImageView = view.findViewById(R.id.ad_icon)
    val titleView: TextView = view.findViewById(R.id.ad_title)
    val bodyView: TextView = view.findViewById(R.id.ad_body)
    val ctaButton: Button = view.findViewById(R.id.ad_cta)
}
```

---

## ProGuard Configuration

Add to your `proguard-rules.pro`:

```proguard
# ApexMediation SDK
-keep class ee.apexmediation.sdk.** { *; }
-dontwarn ee.apexmediation.sdk.**

# Google Play Services
-keep class com.google.android.gms.ads.identifier.** { *; }
```

---

## GDPR Compliance

```kotlin
import ee.apexmediation.sdk.ApexMediation

fun checkGDPRConsent() {
    if (ApexMediation.isGDPRApplicable()) {
        // User is in EU - show consent dialog
        showConsentDialog { consent ->
            ApexMediation.setGDPRConsent(consent)
        }
    }
}

// Using ApexMediation's built-in consent dialog
fun showBuiltInConsentDialog() {
    ApexMediation.showConsentDialog(this) { consent ->
        println("User consent: $consent")
    }
}
```

---

## COPPA Compliance

For apps directed at children under 13:

```kotlin
val config = ApexMediationConfig.Builder(this)
    .setPublisherId("YOUR_PUBLISHER_ID")
    .setApiKey("YOUR_API_KEY")
    .setCoppaCompliant(true) // Disables personalized ads
    .build()
```

---

## Testing

### Test Mode

```kotlin
val config = ApexMediationConfig.Builder(this)
    .setPublisherId("YOUR_PUBLISHER_ID")
    .setApiKey("YOUR_API_KEY")
    .setTestMode(true) // Remove in production!
    .build()
```

### Test Device

```kotlin
ApexMediation.addTestDevice("YOUR_DEVICE_GAID")
```

Find GAID in Logcat on first SDK initialization.

---

## Advanced Features

### Frequency Capping

```kotlin
val frequencyCap = ApexMediationFrequencyCap(
    interstitialMinInterval = 60, // seconds
    rewardedMinInterval = 300, // 5 minutes
    maxInterstitialsPerHour = 4
)

ApexMediation.setFrequencyCap(frequencyCap)
```

### Analytics

```kotlin
import ee.apexmediation.sdk.ApexMediationAnalytics

// Log custom events
ApexMediationAnalytics.logEvent("level_complete", mapOf(
    "level" to 10,
    "score" to 5000,
    "time_seconds" to 120
))

// Log purchases
ApexMediationAnalytics.logPurchase(
    itemId = "premium_pack",
    price = 9.99,
    currency = "USD"
)
```

---

## Troubleshooting

### Ads Not Showing

1. Check initialization callback
2. Verify credentials in dashboard
3. Enable test mode
4. Check internet connection
5. Review Logcat for errors

### Build Errors

**Error**: `Manifest merger failed`
**Solution**: Add `tools:replace="android:label"` to `<application>` tag

**Error**: `Duplicate class found`
**Solution**: Exclude duplicate dependencies:
```gradle
implementation('ee.apexmediation:sdk:2.0.0') {
    exclude group: 'com.google.android.gms'
}
```

---

## Sample Projects

- **Kotlin Sample**: [github.com/apexmediation/android-samples/kotlin](https://github.com/apexmediation/android-samples/kotlin)
- **Java Sample**: [github.com/apexmediation/android-samples/java](https://github.com/apexmediation/android-samples/java)
- **Compose Sample**: [github.com/apexmediation/android-samples/compose](https://github.com/apexmediation/android-samples/compose)

---

## Support

- **Documentation**: [docs.apexmediation.ee](https://docs.apexmediation.ee)
- **Email**: support@bel-consulting.ee
- **Discord**: [discord.gg/apexmediation](https://discord.gg/apexmediation)
- **Response Time**: < 24 hours

---

**Last Updated**: November 2025
**SDK Version**: 2.0.0
**Android Version**: 5.0+ (API 21+)
