# Android Manifest <queries> Documentation

Last updated: 2025-01-06
Owner: SDK Engineering

## Overview

Starting with Android 11 (API 30), apps must declare the packages and intents they need to query using the `<queries>` element in the manifest. This affects ad SDKs that need to detect installed apps or launch external activities.

---

## Why This Matters for Ad SDKs

Ad SDKs often need to:
1. Check if certain apps are installed (for app install ads)
2. Launch external browsers or app stores
3. Detect competing apps for targeting
4. Open social media apps for sharing

Without proper `<queries>` declarations, these operations will fail silently on Android 11+.

---

## Required Queries for Ad SDK

Add these to your `AndroidManifest.xml`:

```xml
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="com.your.app">
    
    <!-- Required for ad SDK functionality on Android 11+ -->
    <queries>
        
        <!-- Browser intents - required for clicking ad URLs -->
        <intent>
            <action android:name="android.intent.action.VIEW" />
            <category android:name="android.intent.category.BROWSABLE" />
            <data android:scheme="https" />
        </intent>
        
        <intent>
            <action android:name="android.intent.action.VIEW" />
            <category android:name="android.intent.category.BROWSABLE" />
            <data android:scheme="http" />
        </intent>
        
        <!-- Market/Play Store intents - for app install ads -->
        <intent>
            <action android:name="android.intent.action.VIEW" />
            <data android:scheme="market" />
        </intent>
        
        <intent>
            <action android:name="android.intent.action.VIEW" />
            <data android:scheme="https" android:host="play.google.com" />
        </intent>
        
        <!-- Custom URI schemes for deep links -->
        <intent>
            <action android:name="android.intent.action.VIEW" />
            <category android:name="android.intent.category.BROWSABLE" />
            <data android:scheme="*" />
        </intent>
        
        <!-- Common browser packages -->
        <package android:name="com.android.chrome" />
        <package android:name="org.mozilla.firefox" />
        <package android:name="com.opera.browser" />
        <package android:name="com.microsoft.emmx" />
        <package android:name="com.brave.browser" />
        
        <!-- Google Play Services - required for AdMob -->
        <package android:name="com.google.android.gms" />
        
        <!-- Common social apps for sharing/attribution -->
        <package android:name="com.facebook.katana" />
        <package android:name="com.instagram.android" />
        <package android:name="com.twitter.android" />
        <package android:name="com.snapchat.android" />
        <package android:name="com.zhiliaoapp.musically" /> <!-- TikTok -->
        
    </queries>
    
    <!-- Rest of your application manifest -->
    <application>
        <!-- ... -->
    </application>
    
</manifest>
```

---

## Partner SDK-Specific Requirements

### AdMob / Google Mobile Ads

```xml
<queries>
    <!-- Required for AdMob -->
    <package android:name="com.google.android.gms" />
    <intent>
        <action android:name="android.intent.action.VIEW" />
        <data android:scheme="https" />
    </intent>
</queries>
```

### Facebook Audience Network

```xml
<queries>
    <!-- Required for Facebook Audience Network -->
    <package android:name="com.facebook.katana" />
    <package android:name="com.facebook.orca" />
    <package android:name="com.instagram.android" />
    <intent>
        <action android:name="android.intent.action.VIEW" />
        <data android:scheme="https" />
    </intent>
</queries>
```

### Unity Ads

```xml
<queries>
    <!-- Required for Unity Ads -->
    <intent>
        <action android:name="android.intent.action.VIEW" />
        <category android:name="android.intent.category.BROWSABLE" />
        <data android:scheme="https" />
    </intent>
    <intent>
        <action android:name="android.intent.action.VIEW" />
        <data android:scheme="market" />
    </intent>
</queries>
```

### AppLovin

```xml
<queries>
    <!-- Required for AppLovin MAX -->
    <intent>
        <action android:name="android.intent.action.VIEW" />
        <category android:name="android.intent.category.BROWSABLE" />
        <data android:scheme="https" />
    </intent>
    <intent>
        <action android:name="android.intent.action.VIEW" />
        <data android:scheme="market" android:host="details" />
    </intent>
    <!-- For MRAID ads -->
    <intent>
        <action android:name="android.intent.action.DIAL" />
        <data android:scheme="tel" />
    </intent>
    <intent>
        <action android:name="android.intent.action.SENDTO" />
        <data android:scheme="mailto" />
    </intent>
</queries>
```

---

## Consolidated Queries for Mediation

If using multiple ad networks through mediation, use this comprehensive set:

```xml
<queries>
    <!-- ============================================== -->
    <!-- REQUIRED FOR AD MEDIATION (Android 11+)       -->
    <!-- ============================================== -->
    
    <!-- Web browsing -->
    <intent>
        <action android:name="android.intent.action.VIEW" />
        <category android:name="android.intent.category.BROWSABLE" />
        <data android:scheme="https" />
    </intent>
    <intent>
        <action android:name="android.intent.action.VIEW" />
        <category android:name="android.intent.category.BROWSABLE" />
        <data android:scheme="http" />
    </intent>
    
    <!-- App stores -->
    <intent>
        <action android:name="android.intent.action.VIEW" />
        <data android:scheme="market" android:host="details" />
    </intent>
    <intent>
        <action android:name="android.intent.action.VIEW" />
        <data android:scheme="https" android:host="play.google.com" />
    </intent>
    
    <!-- MRAID / Interactive ads -->
    <intent>
        <action android:name="android.intent.action.DIAL" />
        <data android:scheme="tel" />
    </intent>
    <intent>
        <action android:name="android.intent.action.SENDTO" />
        <data android:scheme="sms" />
    </intent>
    <intent>
        <action android:name="android.intent.action.SENDTO" />
        <data android:scheme="mailto" />
    </intent>
    
    <!-- Calendar for interactive ads -->
    <intent>
        <action android:name="android.intent.action.INSERT" />
        <data android:mimeType="vnd.android.cursor.item/event" />
    </intent>
    
    <!-- Maps for location-based ads -->
    <intent>
        <action android:name="android.intent.action.VIEW" />
        <data android:scheme="geo" />
    </intent>
    
    <!-- Required packages -->
    <package android:name="com.google.android.gms" />
    <package android:name="com.android.chrome" />
    <package android:name="com.android.vending" />
    
</queries>
```

---

## Checking Query Results

```kotlin
// Check if intent can be resolved
fun canHandleIntent(context: Context, intent: Intent): Boolean {
    val packageManager = context.packageManager
    val activities = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        packageManager.queryIntentActivities(
            intent, 
            PackageManager.ResolveInfoFlags.of(PackageManager.MATCH_DEFAULT_ONLY.toLong())
        )
    } else {
        @Suppress("DEPRECATION")
        packageManager.queryIntentActivities(intent, PackageManager.MATCH_DEFAULT_ONLY)
    }
    return activities.isNotEmpty()
}

// Check if package is installed
fun isPackageInstalled(context: Context, packageName: String): Boolean {
    return try {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            context.packageManager.getPackageInfo(
                packageName, 
                PackageManager.PackageInfoFlags.of(0)
            )
        } else {
            @Suppress("DEPRECATION")
            context.packageManager.getPackageInfo(packageName, 0)
        }
        true
    } catch (e: PackageManager.NameNotFoundException) {
        false
    }
}

// Safe URL open with fallback
fun openUrl(context: Context, url: String) {
    val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url))
    intent.addCategory(Intent.CATEGORY_BROWSABLE)
    
    if (canHandleIntent(context, intent)) {
        context.startActivity(intent)
    } else {
        // Fallback: Use WebView or show error
        showInAppBrowser(context, url)
    }
}
```

---

## Common Issues

### Issue 1: Links Not Opening

**Symptom**: Clicking ads does nothing, no browser opens

**Cause**: Missing `<queries>` for browser intents

**Solution**: Add the browser intent queries shown above

### Issue 2: Play Store Not Opening

**Symptom**: App install ads show error or do nothing

**Cause**: Missing `<queries>` for market scheme

**Solution**: Add market intent queries

### Issue 3: Phone/SMS Actions Fail

**Symptom**: MRAID ads with phone/SMS actions don't work

**Cause**: Missing `<queries>` for tel/sms schemes

**Solution**: Add tel and sms intent queries

---

## QUERY_ALL_PACKAGES Permission

⚠️ **WARNING**: Do not use `QUERY_ALL_PACKAGES` permission unless absolutely necessary.

```xml
<!-- AVOID THIS - requires special Play Store approval -->
<uses-permission android:name="android.permission.QUERY_ALL_PACKAGES" />
```

Google Play restricts this permission. Apps that use it without justification may be rejected.

---

## Testing

```bash
# Check if your app can query a package
adb shell cmd package query-activities --brief <package-name>

# List all queryable packages from your app's perspective
adb shell cmd package list packages

# Force package visibility filtering (debug)
adb shell settings put global hidden_api_policy 0
```

---

## Related Documentation

- [Android Background Restrictions](./ANDROID_BACKGROUND_RESTRICTIONS.md)
- [Partner SDK Threading](./PARTNER_SDK_THREADING.md)
- [Android 11 Package Visibility](https://developer.android.com/training/package-visibility)
