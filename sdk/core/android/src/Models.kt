package com.rivalapexmediation.sdk.models

/**
 * Represents an ad creative and its metadata
 */
data class Ad(
    val id: String,
    val placementId: String,
    val networkName: String,
    val adType: AdType,
    val ecpm: Double,
    val creative: Creative,
    val metadata: Map<String, String> = emptyMap(),
    // Optional absolute expiry timestamp for the ad (epoch millis). If null, ad does not expire by time.
    val expiryTimeMs: Long? = null,
    // Creation time (epoch millis) recorded by the SDK; informative only.
    val createdAtMs: Long = System.currentTimeMillis()
) {
    fun show(activity: android.app.Activity) {
        // Implementation for showing ad
    }
    
    fun isExpired(): Boolean {
        val exp = expiryTimeMs
        return exp != null && System.currentTimeMillis() >= exp
    }
}

/**
 * Ad format types
 */
enum class AdType {
    BANNER,
    INTERSTITIAL,
    REWARDED,
    REWARDED_INTERSTITIAL,
    NATIVE,
    APP_OPEN
}

/**
 * Ad creative content
 */
sealed class Creative {
    data class Banner(
        val width: Int,
        val height: Int,
        val markupHtml: String
    ) : Creative()
    
    data class Video(
        val vastXml: String,
        val duration: Int,
        val skipOffset: Int?
    ) : Creative()
    
    data class Native(
        val title: String,
        val description: String,
        val iconUrl: String?,
        val imageUrl: String?,
        val callToAction: String,
        val clickUrl: String
    ) : Creative()
}

/**
 * Response from ad loading operation
 */
data class AdResponse(
    val ad: Ad?,
    val ecpm: Double,
    val loadTime: Long,
    val networkName: String
) {
    fun isValid(): Boolean {
        return ad != null && !ad.isExpired()
    }
}

/**
 * Placement configuration from backend
 */
data class PlacementConfig(
    val placementId: String,
    val adType: AdType,
    val enabledNetworks: List<String>,
    val timeoutMs: Long = 3000,
    val maxWaitMs: Long = 5000,
    val floorPrice: Double = 0.0,
    val refreshInterval: Int? = null,
    val targeting: Targeting = Targeting()
)

/**
 * Targeting parameters
 */
data class Targeting(
    val age: Int? = null,
    val gender: Gender? = null,
    val keywords: List<String> = emptyList(),
    val customParams: Map<String, String> = emptyMap()
)

enum class Gender {
    MALE,
    FEMALE,
    OTHER,
    UNKNOWN
}

/**
 * Ad adapter interface
 */
interface AdAdapter {
    val name: String
    val version: String
    
    fun isAvailable(): Boolean
    fun loadAd(placement: String, config: PlacementConfig): AdResponse?
    fun destroy()
}

/**
 * Telemetry event
 */
data class TelemetryEvent(
    val eventType: EventType,
    val timestamp: Long = System.currentTimeMillis(),
    val placement: String? = null,
    val networkName: String? = null,
    val ecpm: Double? = null,
    val latency: Long? = null,
    val errorCode: String? = null,
    val errorMessage: String? = null,
    val metadata: Map<String, Any> = emptyMap()
)

enum class EventType {
    SDK_INIT,
    AD_REQUEST,
    AD_LOADED,
    AD_SHOWN,
    AD_CLICKED,
    AD_CLOSED,
    AD_FAILED,
    CONFIG_LOADED,
    CONFIG_FAILED,
    TIMEOUT,
    CIRCUIT_OPEN,
    ANR_DETECTED
}

/**
 * Configuration from backend
 */
data class SDKRemoteConfig(
    val configId: String,
    val version: Long,
    val placements: Map<String, PlacementConfig>,
    val adapters: Map<String, AdapterConfig>,
    val features: FeatureFlags,
    val signature: String,
    val timestamp: Long
)

data class AdapterConfig(
    val name: String,
    val enabled: Boolean,
    val priority: Int,
    val params: Map<String, String>
)

data class FeatureFlags(
    val telemetryEnabled: Boolean = true,
    val crashReportingEnabled: Boolean = true,
    val debugLoggingEnabled: Boolean = false,
    val experimentalFeaturesEnabled: Boolean = false,
    val killSwitch: Boolean = false
)
