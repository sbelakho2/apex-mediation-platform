package com.rivalapexmediation.adapter.facebook

import android.content.Context
import com.facebook.ads.*
import com.rivalapexmediation.sdk.adapter.AdNetworkAdapter
import com.rivalapexmediation.sdk.adapter.AdLoadCallback
import com.rivalapexmediation.sdk.models.Ad
import com.rivalapexmediation.sdk.models.AdType
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Meta Audience Network Adapter for Rival ApexMediation
 * 
 * Features:
 * - Banner, Interstitial, and Rewarded video support
 * - Native ad support
 * - Bidding integration
 * - GDPR and CCPA compliance
 * 
 * Requirements:
 * - Meta Audience Network SDK 6.0.0+
 * - Placement IDs from Meta Business Manager
 */
class FacebookAdapter : AdNetworkAdapter {
    override val networkName = "facebook"
    override val version = "1.0.0"
    override val minSDKVersion = "1.0.0"
    
    private val isInitialized = AtomicBoolean(false)
    
    @Volatile
    private var interstitialAd: InterstitialAd? = null
    
    @Volatile
    private var rewardedVideoAd: RewardedVideoAd? = null
    
    /**
     * Initialize Meta Audience Network SDK
     */
    override fun initialize(context: Context, config: Map<String, Any>) {
        if (isInitialized.get()) {
            return
        }
        
        // Initialize Audience Network SDK
        AudienceNetworkAds.initialize(context)
        
        // Set test mode if configured
        val testMode = config["test_mode"] as? Boolean ?: false
        if (testMode) {
            AdSettings.setTestMode(true)
        }
        
        // Set GDPR consent
        config["gdpr_consent"]?.let { consent ->
            if (consent is Boolean) {
                AdSettings.setDataProcessingOptions(
                    if (consent) emptyArray() else arrayOf("LDU"),
                    if (consent) 0 else 1,
                    if (consent) 0 else 1000
                )
            }
        }
        
        // Set mediation service
        AdSettings.setMediationService("rivalapexmediation:1.0.0")
        
        isInitialized.set(true)
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
            callback.onAdFailed("Facebook Audience Network not initialized", ERROR_NOT_INITIALIZED)
            return
        }
        
        val placementId = config["placement_id"] as? String
            ?: config["ad_unit_id"] as? String
            ?: run {
                callback.onAdFailed("placement_id required", ERROR_INVALID_CONFIG)
                return
            }
        
        val context = config["context"] as? Context
            ?: run {
                callback.onAdFailed("context required", ERROR_INVALID_CONFIG)
                return
            }
        
        when (adType) {
            AdType.BANNER -> loadBanner(context, placementId, config, callback)
            AdType.INTERSTITIAL -> loadInterstitial(context, placementId, config, callback)
            AdType.REWARDED -> loadRewardedVideo(context, placementId, config, callback)
            AdType.NATIVE -> loadNative(context, placementId, config, callback)
            else -> callback.onAdFailed("Unsupported ad type: $adType", ERROR_UNSUPPORTED_AD_TYPE)
        }
    }
    
    /**
     * Load banner ad
     */
    private fun loadBanner(
        context: Context,
        placementId: String,
        config: Map<String, Any>,
        callback: AdLoadCallback
    ) {
        val adSize = when (config["size"] as? String) {
            "banner_50" -> AdSize.BANNER_HEIGHT_50
            "banner_90" -> AdSize.BANNER_HEIGHT_90
            "rectangle" -> AdSize.RECTANGLE_HEIGHT_250
            else -> AdSize.BANNER_HEIGHT_50
        }
        
        val adView = AdView(context, placementId, adSize)
        
        val listener = object : AdListener {
            override fun onError(ad: com.facebook.ads.Ad?, error: AdError?) {
                callback.onAdFailed(
                    "Banner load failed: ${error?.errorMessage}",
                    error?.errorCode ?: -1
                )
            }
            
            override fun onAdLoaded(ad: com.facebook.ads.Ad?) {
                callback.onAdLoaded(Ad(
                    placementId = placementId,
                    adType = AdType.BANNER,
                    networkName = networkName,
                    view = adView,
                    ecpm = 0.0 // Facebook doesn't provide eCPM in callback
                ))
            }
            
            override fun onAdClicked(ad: com.facebook.ads.Ad?) {}
            override fun onLoggingImpression(ad: com.facebook.ads.Ad?) {}
        }
        
        adView.loadAd(adView.buildLoadAdConfig().withAdListener(listener).build())
    }
    
    /**
     * Load interstitial ad
     */
    private fun loadInterstitial(
        context: Context,
        placementId: String,
        config: Map<String, Any>,
        callback: AdLoadCallback
    ) {
        val interstitial = InterstitialAd(context, placementId)
        
        val listener = object : InterstitialAdListener {
            override fun onError(ad: com.facebook.ads.Ad?, error: AdError?) {
                callback.onAdFailed(
                    "Interstitial load failed: ${error?.errorMessage}",
                    error?.errorCode ?: -1
                )
            }
            
            override fun onAdLoaded(ad: com.facebook.ads.Ad?) {
                interstitialAd = interstitial
                
                callback.onAdLoaded(Ad(
                    placementId = placementId,
                    adType = AdType.INTERSTITIAL,
                    networkName = networkName,
                    facebookInterstitialAd = interstitial,
                    ecpm = 0.0
                ))
            }
            
            override fun onAdClicked(ad: com.facebook.ads.Ad?) {}
            override fun onLoggingImpression(ad: com.facebook.ads.Ad?) {}
            override fun onInterstitialDisplayed(ad: com.facebook.ads.Ad?) {}
            override fun onInterstitialDismissed(ad: com.facebook.ads.Ad?) {}
        }
        
        interstitial.loadAd(interstitial.buildLoadAdConfig().withAdListener(listener).build())
    }
    
    /**
     * Load rewarded video ad
     */
    private fun loadRewardedVideo(
        context: Context,
        placementId: String,
        config: Map<String, Any>,
        callback: AdLoadCallback
    ) {
        val rewardedVideo = RewardedVideoAd(context, placementId)
        
        val listener = object : RewardedVideoAdListener {
            override fun onError(ad: com.facebook.ads.Ad?, error: AdError?) {
                callback.onAdFailed(
                    "Rewarded video load failed: ${error?.errorMessage}",
                    error?.errorCode ?: -1
                )
            }
            
            override fun onAdLoaded(ad: com.facebook.ads.Ad?) {
                rewardedVideoAd = rewardedVideo
                
                callback.onAdLoaded(Ad(
                    placementId = placementId,
                    adType = AdType.REWARDED,
                    networkName = networkName,
                    facebookRewardedAd = rewardedVideo,
                    ecpm = 0.0
                ))
            }
            
            override fun onAdClicked(ad: com.facebook.ads.Ad?) {}
            override fun onLoggingImpression(ad: com.facebook.ads.Ad?) {}
            override fun onRewardedVideoCompleted() {}
            override fun onRewardedVideoClosed() {}
        }
        
        rewardedVideo.loadAd(rewardedVideo.buildLoadAdConfig().withAdListener(listener).build())
    }
    
    /**
     * Load native ad
     */
    private fun loadNative(
        context: Context,
        placementId: String,
        config: Map<String, Any>,
        callback: AdLoadCallback
    ) {
        val nativeAd = NativeAd(context, placementId)
        
        val listener = object : NativeAdListener {
            override fun onError(ad: com.facebook.ads.Ad?, error: AdError?) {
                callback.onAdFailed(
                    "Native ad load failed: ${error?.errorMessage}",
                    error?.errorCode ?: -1
                )
            }
            
            override fun onAdLoaded(ad: com.facebook.ads.Ad?) {
                callback.onAdLoaded(Ad(
                    placementId = placementId,
                    adType = AdType.NATIVE,
                    networkName = networkName,
                    facebookNativeAd = nativeAd,
                    ecpm = 0.0
                ))
            }
            
            override fun onAdClicked(ad: com.facebook.ads.Ad?) {}
            override fun onLoggingImpression(ad: com.facebook.ads.Ad?) {}
            override fun onMediaDownloaded(ad: com.facebook.ads.Ad?) {}
        }
        
        nativeAd.loadAd(nativeAd.buildLoadAdConfig().withAdListener(listener).build())
    }
    
    /**
     * Check if adapter supports ad type
     */
    override fun supportsAdType(adType: AdType): Boolean {
        return when (adType) {
            AdType.BANNER,
            AdType.INTERSTITIAL,
            AdType.REWARDED,
            AdType.NATIVE -> true
            else -> false
        }
    }
    
    /**
     * Clean up resources
     */
    override fun destroy() {
        interstitialAd?.destroy()
        rewardedVideoAd?.destroy()
        interstitialAd = null
        rewardedVideoAd = null
        isInitialized.set(false)
    }
    
    companion object {
        private const val ERROR_NOT_INITIALIZED = -1
        private const val ERROR_INVALID_CONFIG = -2
        private const val ERROR_UNSUPPORTED_AD_TYPE = -3
    }
}
