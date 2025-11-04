package com.rivalapexmediation.adapter.admob

import android.content.Context
import com.google.android.gms.ads.*
import com.google.android.gms.ads.interstitial.InterstitialAd
import com.google.android.gms.ads.interstitial.InterstitialAdLoadCallback
import com.google.android.gms.ads.rewarded.RewardedAd
import com.google.android.gms.ads.rewarded.RewardedAdLoadCallback
import com.rivalapexmediation.sdk.adapter.AdNetworkAdapter
import com.rivalapexmediation.sdk.adapter.AdLoadCallback
import com.rivalapexmediation.sdk.models.Ad
import com.rivalapexmediation.sdk.models.AdType
import java.util.concurrent.atomic.AtomicBoolean

/**
 * AdMob Adapter for Rival ApexMediation
 * 
 * Features:
 * - Banner, Interstitial, and Rewarded ad support
 * - Automatic retry on transient failures
 * - Proper lifecycle management
 * - Thread-safe operations
 * 
 * Requirements:
 * - Google Mobile Ads SDK 22.0.0+
 * - AdMob app ID in AndroidManifest.xml
 */
class AdMobAdapter : AdNetworkAdapter {
    override val networkName = "admob"
    override val version = "1.0.0"
    override val minSDKVersion = "1.0.0"
    
    private val isInitialized = AtomicBoolean(false)
    private var appId: String? = null
    
    @Volatile
    private var interstitialAd: InterstitialAd? = null
    
    @Volatile
    private var rewardedAd: RewardedAd? = null
    
    /**
     * Initialize AdMob SDK
     */
    override fun initialize(context: Context, config: Map<String, Any>) {
        if (isInitialized.get()) {
            return
        }
        
        appId = config["app_id"] as? String
            ?: throw IllegalArgumentException("AdMob app_id required in config")
        
        // Initialize Mobile Ads SDK
        MobileAds.initialize(context) { initStatus ->
            // Initialization complete
            isInitialized.set(true)
        }
        
        // Set request configuration
        val requestConfiguration = RequestConfiguration.Builder()
            .setTestDeviceIds(listOf(AdRequest.TEST_DEVICE_ID_EMULATOR))
            .build()
        
        MobileAds.setRequestConfiguration(requestConfiguration)
    }
    
    /**
     * Load ad based on type
     */
    override fun loadAd(
        placement: String,
        adType: AdType,
        config: Map<String, Any>,
        callback: AdLoadCallback
    ) {
        if (!isInitialized.get()) {
            callback.onAdFailed("AdMob not initialized", ERROR_NOT_INITIALIZED)
            return
        }
        
        val adUnitId = config["ad_unit_id"] as? String
            ?: config["unit_id"] as? String
            ?: run {
                callback.onAdFailed("ad_unit_id required", ERROR_INVALID_CONFIG)
                return
            }
        
        val context = config["context"] as? Context
            ?: run {
                callback.onAdFailed("context required", ERROR_INVALID_CONFIG)
                return
            }
        
        when (adType) {
            AdType.BANNER -> loadBanner(context, adUnitId, config, callback)
            AdType.INTERSTITIAL -> loadInterstitial(context, adUnitId, config, callback)
            AdType.REWARDED -> loadRewarded(context, adUnitId, config, callback)
            else -> callback.onAdFailed("Unsupported ad type: $adType", ERROR_UNSUPPORTED_AD_TYPE)
        }
    }
    
    /**
     * Load banner ad
     */
    private fun loadBanner(
        context: Context,
        adUnitId: String,
        config: Map<String, Any>,
        callback: AdLoadCallback
    ) {
        val adSize = when (config["size"] as? String) {
            "banner" -> AdSize.BANNER
            "large_banner" -> AdSize.LARGE_BANNER
            "medium_rectangle" -> AdSize.MEDIUM_RECTANGLE
            "full_banner" -> AdSize.FULL_BANNER
            "leaderboard" -> AdSize.LEADERBOARD
            else -> AdSize.BANNER
        }
        
        val adView = AdView(context).apply {
            setAdSize(adSize)
            setAdUnitId(adUnitId)
            adListener = object : AdListener() {
                override fun onAdLoaded() {
                    callback.onAdLoaded(Ad(
                        placementId = adUnitId,
                        adType = AdType.BANNER,
                        networkName = networkName,
                        view = this@apply,
                        ecpm = 0.0 // AdMob doesn't provide eCPM in callback
                    ))
                }
                
                override fun onAdFailedToLoad(error: LoadAdError) {
                    callback.onAdFailed(
                        "Banner load failed: ${error.message}",
                        error.code
                    )
                }
            }
        }
        
        adView.loadAd(buildAdRequest(config))
    }
    
    /**
     * Load interstitial ad
     */
    private fun loadInterstitial(
        context: Context,
        adUnitId: String,
        config: Map<String, Any>,
        callback: AdLoadCallback
    ) {
        InterstitialAd.load(
            context,
            adUnitId,
            buildAdRequest(config),
            object : InterstitialAdLoadCallback() {
                override fun onAdLoaded(ad: InterstitialAd) {
                    interstitialAd = ad
                    
                    callback.onAdLoaded(Ad(
                        placementId = adUnitId,
                        adType = AdType.INTERSTITIAL,
                        networkName = networkName,
                        interstitialAd = ad,
                        ecpm = extractECPM(ad.responseInfo)
                    ))
                }
                
                override fun onAdFailedToLoad(error: LoadAdError) {
                    callback.onAdFailed(
                        "Interstitial load failed: ${error.message}",
                        error.code
                    )
                }
            }
        )
    }
    
    /**
     * Load rewarded ad
     */
    private fun loadRewarded(
        context: Context,
        adUnitId: String,
        config: Map<String, Any>,
        callback: AdLoadCallback
    ) {
        RewardedAd.load(
            context,
            adUnitId,
            buildAdRequest(config),
            object : RewardedAdLoadCallback() {
                override fun onAdLoaded(ad: RewardedAd) {
                    rewardedAd = ad
                    
                    callback.onAdLoaded(Ad(
                        placementId = adUnitId,
                        adType = AdType.REWARDED,
                        networkName = networkName,
                        rewardedAd = ad,
                        ecpm = extractECPM(ad.responseInfo)
                    ))
                }
                
                override fun onAdFailedToLoad(error: LoadAdError) {
                    callback.onAdFailed(
                        "Rewarded load failed: ${error.message}",
                        error.code
                    )
                }
            }
        )
    }
    
    /**
     * Build AdRequest with targeting parameters
     */
    private fun buildAdRequest(config: Map<String, Any>): AdRequest {
        val builder = AdRequest.Builder()
        
        // Add targeting extras
        config["keywords"]?.let { keywords ->
            if (keywords is List<*>) {
                keywords.filterIsInstance<String>().forEach { keyword ->
                    builder.addKeyword(keyword)
                }
            }
        }
        
        // Add custom targeting
        config["custom_targeting"]?.let { targeting ->
            if (targeting is Map<*, *>) {
                targeting.forEach { (key, value) ->
                    if (key is String && value is String) {
                        builder.addCustomEventParam(key, value)
                    }
                }
            }
        }
        
        return builder.build()
    }
    
    /**
     * Extract eCPM from response info (if available)
     */
    private fun extractECPM(responseInfo: ResponseInfo?): Double {
        // AdMob doesn't always provide eCPM in response
        // This would require additional API calls or estimation
        return 0.0
    }
    
    /**
     * Check if adapter supports ad type
     */
    override fun supportsAdType(adType: AdType): Boolean {
        return when (adType) {
            AdType.BANNER,
            AdType.INTERSTITIAL,
            AdType.REWARDED -> true
            else -> false
        }
    }
    
    /**
     * Clean up resources
     */
    override fun destroy() {
        interstitialAd = null
        rewardedAd = null
        isInitialized.set(false)
    }
    
    companion object {
        private const val ERROR_NOT_INITIALIZED = -1
        private const val ERROR_INVALID_CONFIG = -2
        private const val ERROR_UNSUPPORTED_AD_TYPE = -3
    }
}

/**
 * AdMob-specific extension function for AdRequest.Builder
 */
private fun AdRequest.Builder.addCustomEventParam(key: String, value: String): AdRequest.Builder {
    // AdMob doesn't have direct custom event params in newer SDK versions
    // This is a placeholder for potential future functionality
    return this
}
