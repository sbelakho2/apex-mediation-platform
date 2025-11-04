package com.rivalapexmediation.adapter.applovin

import android.content.Context
import com.applovin.mediation.MaxAd
import com.applovin.mediation.MaxAdListener
import com.applovin.mediation.MaxError
import com.applovin.mediation.MaxReward
import com.applovin.mediation.MaxRewardedAdListener
import com.applovin.mediation.ads.MaxAdView
import com.applovin.mediation.ads.MaxInterstitialAd
import com.applovin.mediation.ads.MaxRewardedAd
import com.applovin.sdk.AppLovinSdk
import com.applovin.sdk.AppLovinSdkConfiguration
import com.rivalapexmediation.sdk.adapter.AdNetworkAdapter
import com.rivalapexmediation.sdk.adapter.AdLoadCallback
import com.rivalapexmediation.sdk.models.Ad
import com.rivalapexmediation.sdk.models.AdType
import java.util.concurrent.atomic.AtomicBoolean

/**
 * AppLovin MAX Adapter for Rival ApexMediation
 * 
 * Features:
 * - MAX mediation support
 * - Banner, Interstitial, and Rewarded ads
 * - Revenue callbacks with eCPM data
 * - User consent management
 * 
 * Requirements:
 * - AppLovin SDK 11.0.0+
 * - AppLovin SDK key in AndroidManifest.xml
 */
class AppLovinAdapter : AdNetworkAdapter {
    override val networkName = "applovin"
    override val version = "1.0.0"
    override val minSDKVersion = "1.0.0"
    
    private val isInitialized = AtomicBoolean(false)
    private var sdk: AppLovinSdk? = null
    
    @Volatile
    private var interstitialAd: MaxInterstitialAd? = null
    
    @Volatile
    private var rewardedAd: MaxRewardedAd? = null
    
    /**
     * Initialize AppLovin SDK
     */
    override fun initialize(context: Context, config: Map<String, Any>) {
        if (isInitialized.get()) {
            return
        }
        
        val sdkKey = config["sdk_key"] as? String
            ?: throw IllegalArgumentException("AppLovin sdk_key required in config")
        
        // Initialize SDK
        sdk = AppLovinSdk.getInstance(sdkKey, AppLovinSdk.settings, context)
        
        // Set user consent if provided
        config["has_user_consent"]?.let { hasConsent ->
            if (hasConsent is Boolean) {
                AppLovinPrivacySettings.setHasUserConsent(hasConsent, context)
            }
        }
        
        // Set age restricted user if provided
        config["is_age_restricted_user"]?.let { isAgeRestricted ->
            if (isAgeRestricted is Boolean) {
                AppLovinPrivacySettings.setIsAgeRestrictedUser(isAgeRestricted, context)
            }
        }
        
        // Initialize SDK with configuration
        sdk?.initializeSdk { configuration: AppLovinSdkConfiguration ->
            isInitialized.set(true)
        }
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
            callback.onAdFailed("AppLovin not initialized", ERROR_NOT_INITIALIZED)
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
        val adView = MaxAdView(adUnitId, context)
        
        adView.setListener(object : MaxAdListener {
            override fun onAdLoaded(ad: MaxAd) {
                callback.onAdLoaded(Ad(
                    placementId = adUnitId,
                    adType = AdType.BANNER,
                    networkName = networkName,
                    view = adView,
                    ecpm = ad.revenue // AppLovin provides revenue data
                ))
            }
            
            override fun onAdLoadFailed(adUnitId: String, error: MaxError) {
                callback.onAdFailed(
                    "Banner load failed: ${error.message}",
                    error.code
                )
            }
            
            override fun onAdDisplayed(ad: MaxAd) {}
            override fun onAdHidden(ad: MaxAd) {}
            override fun onAdClicked(ad: MaxAd) {}
            override fun onAdDisplayFailed(ad: MaxAd, error: MaxError) {}
        })
        
        // Load the ad
        adView.loadAd()
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
        val interstitial = MaxInterstitialAd(adUnitId, context)
        
        interstitial.setListener(object : MaxAdListener {
            override fun onAdLoaded(ad: MaxAd) {
                interstitialAd = interstitial
                
                callback.onAdLoaded(Ad(
                    placementId = adUnitId,
                    adType = AdType.INTERSTITIAL,
                    networkName = networkName,
                    maxInterstitialAd = interstitial,
                    ecpm = ad.revenue
                ))
            }
            
            override fun onAdLoadFailed(adUnitId: String, error: MaxError) {
                callback.onAdFailed(
                    "Interstitial load failed: ${error.message}",
                    error.code
                )
            }
            
            override fun onAdDisplayed(ad: MaxAd) {}
            override fun onAdHidden(ad: MaxAd) {}
            override fun onAdClicked(ad: MaxAd) {}
            override fun onAdDisplayFailed(ad: MaxAd, error: MaxError) {}
        })
        
        // Load the ad
        interstitial.loadAd()
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
        val rewarded = MaxRewardedAd.getInstance(adUnitId, context)
        
        rewarded.setListener(object : MaxRewardedAdListener {
            override fun onAdLoaded(ad: MaxAd) {
                rewardedAd = rewarded
                
                callback.onAdLoaded(Ad(
                    placementId = adUnitId,
                    adType = AdType.REWARDED,
                    networkName = networkName,
                    maxRewardedAd = rewarded,
                    ecpm = ad.revenue
                ))
            }
            
            override fun onAdLoadFailed(adUnitId: String, error: MaxError) {
                callback.onAdFailed(
                    "Rewarded load failed: ${error.message}",
                    error.code
                )
            }
            
            override fun onAdDisplayed(ad: MaxAd) {}
            override fun onAdHidden(ad: MaxAd) {}
            override fun onAdClicked(ad: MaxAd) {}
            override fun onAdDisplayFailed(ad: MaxAd, error: MaxError) {}
            
            override fun onRewardedVideoStarted(ad: MaxAd) {}
            override fun onRewardedVideoCompleted(ad: MaxAd) {}
            
            override fun onUserRewarded(ad: MaxAd, reward: MaxReward) {
                // Reward user
            }
        })
        
        // Load the ad
        rewarded.loadAd()
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
        interstitialAd?.destroy()
        rewardedAd = null
        interstitialAd = null
        isInitialized.set(false)
    }
    
    companion object {
        private const val ERROR_NOT_INITIALIZED = -1
        private const val ERROR_INVALID_CONFIG = -2
        private const val ERROR_UNSUPPORTED_AD_TYPE = -3
    }
}

/**
 * Privacy settings helper for AppLovin
 */
private object AppLovinPrivacySettings {
    fun setHasUserConsent(hasConsent: Boolean, context: Context) {
        AppLovinSdk.getInstance(context).settings.setHasUserConsent(hasConsent)
    }
    
    fun setIsAgeRestrictedUser(isAgeRestricted: Boolean, context: Context) {
        AppLovinSdk.getInstance(context).settings.setIsAgeRestrictedUser(isAgeRestricted)
    }
}
