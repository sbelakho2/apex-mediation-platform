# Android Background Restrictions

Last updated: 2025-01-06
Owner: SDK Engineering

## Overview

Android has increasingly strict background execution limits starting from Android 8.0 (Oreo). This document explains how these restrictions affect ad SDK operations and provides solutions for reliable background ad loading.

---

## Background Execution Limits by Android Version

| Android Version | API Level | Key Restrictions |
|-----------------|-----------|------------------|
| Android 8.0 Oreo | 26+ | Background Service limits, implicit broadcast limits |
| Android 9 Pie | 28+ | App Standby Buckets, battery saver restrictions |
| Android 10 | 29+ | Background activity launch restrictions |
| Android 11 | 30+ | One-shot location, foreground service types |
| Android 12 | 31+ | Foreground service launch restrictions, exact alarm limits |
| Android 13 | 33+ | Battery optimization defaults, notification permissions |
| Android 14 | 34+ | Foreground service types mandatory, exact alarm restrictions |

---

## Impact on Ad SDK Operations

### 1. Background Ad Prefetching

**Problem**: Background services for ad prefetching are killed after ~1 minute on Android 8+.

**Solution**: Use WorkManager with constraints.

```kotlin
// ✅ CORRECT: Use WorkManager for background ad prefetch
class AdPrefetchWorker(
    context: Context,
    params: WorkerParameters
) : CoroutineWorker(context, params) {
    
    override suspend fun doWork(): Result {
        return try {
            val adCache = AdCacheManager.getInstance(applicationContext)
            adCache.prefetchAds(listOf("banner", "interstitial"))
            Result.success()
        } catch (e: Exception) {
            Result.retry()
        }
    }
}

// Schedule the work
fun scheduleAdPrefetch(context: Context) {
    val constraints = Constraints.Builder()
        .setRequiredNetworkType(NetworkType.CONNECTED)
        .setRequiresBatteryNotLow(true)
        .build()
    
    val prefetchRequest = PeriodicWorkRequestBuilder<AdPrefetchWorker>(
        15, TimeUnit.MINUTES,  // Minimum interval
        5, TimeUnit.MINUTES    // Flex interval
    )
        .setConstraints(constraints)
        .setBackoffCriteria(
            BackoffPolicy.EXPONENTIAL,
            WorkRequest.MIN_BACKOFF_MILLIS,
            TimeUnit.MILLISECONDS
        )
        .build()
    
    WorkManager.getInstance(context)
        .enqueueUniquePeriodicWork(
            "ad_prefetch",
            ExistingPeriodicWorkPolicy.KEEP,
            prefetchRequest
        )
}
```

### 2. Scheduled Ad Refresh

**Problem**: `AlarmManager.setExact()` no longer works reliably for background ad refresh.

**Solution**: Use inexact alarms or WorkManager.

```kotlin
// ✅ CORRECT: Use inexact alarms for ad refresh
fun scheduleAdRefresh(context: Context) {
    val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    val intent = Intent(context, AdRefreshReceiver::class.java)
    val pendingIntent = PendingIntent.getBroadcast(
        context,
        AD_REFRESH_REQUEST_CODE,
        intent,
        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
    )
    
    // Use inexact repeating alarm (more battery friendly)
    alarmManager.setInexactRepeating(
        AlarmManager.ELAPSED_REALTIME,
        SystemClock.elapsedRealtime() + TimeUnit.MINUTES.toMillis(15),
        AlarmManager.INTERVAL_FIFTEEN_MINUTES,
        pendingIntent
    )
}

// For Android 12+, check exact alarm permission
fun canScheduleExactAlarms(context: Context): Boolean {
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        alarmManager.canScheduleExactAlarms()
    } else {
        true
    }
}
```

### 3. Foreground Service for Video Ads

**Problem**: Android 12+ restricts launching foreground services from background.

**Solution**: Use appropriate foreground service types and launch from foreground.

```kotlin
// ✅ CORRECT: Properly typed foreground service for video ad playback
class VideoAdService : Service() {
    
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val notification = createNotification()
        
        // Android 14+ requires specific foreground service type
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            startForeground(NOTIFICATION_ID, notification, 
                ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK)
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }
        
        return START_NOT_STICKY
    }
    
    // ... rest of service
}

// In AndroidManifest.xml
// <service
//     android:name=".VideoAdService"
//     android:foregroundServiceType="mediaPlayback"
//     android:exported="false" />
```

### 4. Doze Mode and App Standby

**Problem**: Network access blocked in Doze mode and when app is in Standby bucket.

**Solution**: Request exemption for time-critical operations or defer gracefully.

```kotlin
// Check if app is restricted
fun isBackgroundRestricted(context: Context): Boolean {
    val activityManager = context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
        activityManager.isBackgroundRestricted
    } else {
        false
    }
}

// Check battery optimization status
fun isIgnoringBatteryOptimizations(context: Context): Boolean {
    val powerManager = context.getSystemService(Context.POWER_SERVICE) as PowerManager
    return powerManager.isIgnoringBatteryOptimizations(context.packageName)
}

// Request exemption (only for essential apps!)
fun requestBatteryOptimizationExemption(activity: Activity) {
    if (!isIgnoringBatteryOptimizations(activity)) {
        val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS)
        intent.data = Uri.parse("package:${activity.packageName}")
        activity.startActivity(intent)
    }
}
```

---

## Best Practices for Background Ad Operations

### 1. Graceful Degradation

```kotlin
class AdManager(private val context: Context) {
    
    fun prefetchAds() {
        when {
            isAppInForeground() -> prefetchImmediately()
            isBackgroundRestricted(context) -> skipPrefetch()
            else -> schedulePrefetchWork()
        }
    }
    
    private fun isAppInForeground(): Boolean {
        val activityManager = context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
        val appProcesses = activityManager.runningAppProcesses ?: return false
        return appProcesses.any { 
            it.uid == Process.myUid() && 
            it.importance == ActivityManager.RunningAppProcessInfo.IMPORTANCE_FOREGROUND 
        }
    }
}
```

### 2. Expedited Work for Critical Operations

```kotlin
// For critical ad operations that need to run soon
fun scheduleUrgentAdLoad(context: Context) {
    val urgentWork = OneTimeWorkRequestBuilder<AdLoadWorker>()
        .setExpedited(OutOfQuotaPolicy.RUN_AS_NON_EXPEDITED_WORK_REQUEST)
        .build()
    
    WorkManager.getInstance(context).enqueue(urgentWork)
}
```

### 3. Network Callback for Connectivity Changes

```kotlin
class NetworkAwareAdManager(private val context: Context) {
    private val connectivityManager = 
        context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
    
    private val networkCallback = object : ConnectivityManager.NetworkCallback() {
        override fun onAvailable(network: Network) {
            // Network became available - opportunity to refresh ads
            if (shouldRefreshAds()) {
                refreshAdsInBackground()
            }
        }
        
        override fun onLost(network: Network) {
            // Network lost - rely on cached ads
            enableCacheOnlyMode()
        }
    }
    
    fun registerNetworkCallback() {
        val request = NetworkRequest.Builder()
            .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
            .build()
        connectivityManager.registerNetworkCallback(request, networkCallback)
    }
}
```

---

## App Standby Buckets

Android 9+ uses App Standby Buckets to limit background work based on app usage:

| Bucket | Job Frequency | Alarm Frequency | Network |
|--------|--------------|-----------------|---------|
| Active | No restrictions | No restrictions | No restrictions |
| Working Set | 2 hours | 6 hours | No restrictions |
| Frequent | 8 hours | 2 hours | No restrictions |
| Rare | 24 hours | 24 hours | Restricted |
| Restricted | Once per day | Once per day | Restricted |

### Checking Current Bucket

```kotlin
fun getAppStandbyBucket(context: Context): Int {
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
        val usageStatsManager = 
            context.getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager
        usageStatsManager.appStandbyBucket
    } else {
        UsageStatsManager.STANDBY_BUCKET_ACTIVE
    }
}

fun isInRestrictedBucket(context: Context): Boolean {
    val bucket = getAppStandbyBucket(context)
    return bucket >= UsageStatsManager.STANDBY_BUCKET_RARE
}
```

---

## Manifest Declarations

```xml
<!-- Required permissions for background work -->
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
<uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED" />

<!-- Optional: For exact alarms (must justify to Play Store) -->
<uses-permission android:name="android.permission.SCHEDULE_EXACT_ALARM" 
    android:maxSdkVersion="32" />
<uses-permission android:name="android.permission.USE_EXACT_ALARM" />

<!-- Foreground service type for video ads -->
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK" />

<!-- WorkManager initialization -->
<provider
    android:name="androidx.startup.InitializationProvider"
    android:authorities="${applicationId}.androidx-startup"
    android:exported="false"
    tools:node="merge">
    <meta-data
        android:name="androidx.work.WorkManagerInitializer"
        android:value="androidx.startup" />
</provider>
```

---

## Testing Background Restrictions

```bash
# Force app into restricted bucket
adb shell am set-standby-bucket <package-name> restricted

# Simulate Doze mode
adb shell dumpsys deviceidle force-idle

# Exit Doze mode
adb shell dumpsys deviceidle unforce

# Check current bucket
adb shell am get-standby-bucket <package-name>

# Simulate background restrictions
adb shell cmd appops set <package-name> RUN_IN_BACKGROUND deny
```

---

## Related Documentation

- [Partner SDK Threading](./PARTNER_SDK_THREADING.md)
- [Android Manifest Queries](./ANDROID_MANIFEST_QUERIES.md)
- [Network Monitor Implementation](../Implementation/network-monitor.md)
