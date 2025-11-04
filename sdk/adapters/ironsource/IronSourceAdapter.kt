package com.rivalapexmediation.adapter.ironsource

import android.app.Activity
import android.content.Context
import com.ironsource.mediationsdk.IronSource
import com.ironsource.mediationsdk.logger.IronSourceError
import com.ironsource.mediationsdk.model.Placement
import com.ironsource.mediationsdk.sdk.*
import com.rivalapexmediation.sdk.adapter.AdNetworkAdapter
import com.rivalapexmediation.sdk.adapter.AdLoadCallback
import com.rivalapexmediation.sdk.models.Ad
import com.rivalapexmediation.sdk.models.AdType
import java.util.concurrent.atomic.AtomicBoolean

/**
 * IronSource Adapter for Rival ApexMediation
 * 
 * Features:
 * - Interstitial and Rewarded video support
 * - Mediation platform integration
 * - Server-to-server callbacks
 * - Advanced targeting
 * 
 * Requirements:
 * - IronSource SDK 7.2.0+
 * - App key from IronSource dashboard
 */
class IronSourceAdapter : AdNetworkAdapter {
    override val networkName = "ironsource"
    override val version = "1.0.0"
    override val minSDKVersion = "1.0.0"
    
    private val isInitialized = AtomicBoolean(false)
    private var appKey: String? = null
    private var pendingCallback: AdLoadCallback? = null
    private var currentPlacement: String? = null
    
    /**
     * Initialize IronSource SDK
     */
    override fun initialize(context: Context, config: Map<String, Any>) {
        if (isInitialized.get()) {
            return
        }
        
        appKey = config["app_key"] as? String
            ?: throw IllegalArgumentException("IronSource app_key required in config")
        
        val activity = context as? Activity
            ?: throw IllegalArgumentException("IronSource requires Activity context")
        
        // Set user ID if provided
        config["user_id"]?.let { userId ->
            IronSource.setUserId(userId.toString())
        }
        
        // Set consent if provided
        config["consent"]?.let { consent ->
            if (consent is Boolean) {
                IronSource.setConsent(consent)
            }
        }
        
        // Set metadata
        config["metadata"]?.let { metadata ->
            if (metadata is Map<*, *>) {
                metadata.forEach { (key, value) ->
                    if (key is String && value is String) {
                        IronSource.setMetaData(key, value)
                    }
                }
            }
        }
        
        // Initialize ad units
        val adUnits = mutableListOf<String>()
        if (config["enable_interstitial"] as? Boolean != false) {
            adUnits.add(IronSource.AD_UNIT.INTERSTITIAL.toString())
        }
        if (config["enable_rewarded"] as? Boolean != false) {
            adUnits.add(IronSource.AD_UNIT.REWARDED_VIDEO.toString())
        }
        if (config["enable_banner"] as? Boolean != false) {
            adUnits.add(IronSource.AD_UNIT.BANNER.toString())
        }
        
        // Initialize SDK
        IronSource.init(activity, appKey, *adUnits.toTypedArray())
        
        // Set listeners
        setupListeners()
        
        isInitialized.set(true)
    }
    
    /**
     * Setup IronSource listeners
     */
    private fun setupListeners() {
        // Interstitial listener
        IronSource.setInterstitialListener(object : InterstitialListener {
            override fun onInterstitialAdReady() {
                pendingCallback?.let { callback ->
                    callback.onAdLoaded(Ad(
                        placementId = currentPlacement ?: "",
                        adType = AdType.INTERSTITIAL,
                        networkName = networkName,
                        ironSourcePlacement = currentPlacement,
                        ecpm = 0.0 // IronSource provides eCPM via separate API
                    ))
                    pendingCallback = null
                }
            }
            
            override fun onInterstitialAdLoadFailed(error: IronSourceError) {
                pendingCallback?.onAdFailed(
                    "Interstitial load failed: ${error.errorMessage}",
                    error.errorCode
                )
                pendingCallback = null
            }
            
            override fun onInterstitialAdOpened() {}
            override fun onInterstitialAdClosed() {}
            override fun onInterstitialAdShowSucceeded() {}
            override fun onInterstitialAdShowFailed(error: IronSourceError) {}
            override fun onInterstitialAdClicked() {}
        })
        
        // Rewarded video listener
        IronSource.setRewardedVideoListener(object : RewardedVideoListener {
            override fun onRewardedVideoAdOpened() {}
            override fun onRewardedVideoAdClosed() {}
            
            override fun onRewardedVideoAvailabilityChanged(available: Boolean) {
                if (available) {
                    pendingCallback?.let { callback ->
                        callback.onAdLoaded(Ad(
                            placementId = currentPlacement ?: "",
                            adType = AdType.REWARDED,
                            networkName = networkName,
                            ironSourcePlacement = currentPlacement,
                            ecpm = 0.0
                        ))
                        pendingCallback = null
                    }
                } else {
                    pendingCallback?.onAdFailed("Rewarded video not available", -1)
                    pendingCallback = null
                }
            }
            
            override fun onRewardedVideoAdStarted() {}
            override fun onRewardedVideoAdEnded() {}
            override fun onRewardedVideoAdRewarded(placement: Placement) {}
            override fun onRewardedVideoAdShowFailed(error: IronSourceError) {}
            override fun onRewardedVideoAdClicked(placement: Placement) {}
        })
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
            callback.onAdFailed("IronSource not initialized", ERROR_NOT_INITIALIZED)
            return
        }
        
        currentPlacement = placement
        pendingCallback = callback
        
        when (adType) {
            AdType.INTERSTITIAL -> loadInterstitial(placement, callback)
            AdType.REWARDED -> loadRewarded(placement, callback)
            else -> {
                callback.onAdFailed("Unsupported ad type: $adType", ERROR_UNSUPPORTED_AD_TYPE)
                pendingCallback = null
            }
        }
    }
    
    /**
     * Load interstitial ad
     */
    private fun loadInterstitial(placement: String, callback: AdLoadCallback) {
        // Check if already available
        if (IronSource.isInterstitialReady()) {
            callback.onAdLoaded(Ad(
                placementId = placement,
                adType = AdType.INTERSTITIAL,
                networkName = networkName,
                ironSourcePlacement = placement,
                ecpm = 0.0
            ))
            pendingCallback = null
        } else {
            // Load will trigger listener callback
            IronSource.loadInterstitial()
        }
    }
    
    /**
     * Load rewarded video ad
     */
    private fun loadRewarded(placement: String, callback: AdLoadCallback) {
        // Check if already available
        if (IronSource.isRewardedVideoAvailable()) {
            callback.onAdLoaded(Ad(
                placementId = placement,
                adType = AdType.REWARDED,
                networkName = networkName,
                ironSourcePlacement = placement,
                ecpm = 0.0
            ))
            pendingCallback = null
        }
        // If not available, listener will be triggered when ready
    }
    
    /**
     * Check if adapter supports ad type
     */
    override fun supportsAdType(adType: AdType): Boolean {
        return when (adType) {
            AdType.INTERSTITIAL,
            AdType.REWARDED,
            AdType.BANNER -> true
            else -> false
        }
    }
    
    /**
     * Clean up resources
     */
    override fun destroy() {
        isInitialized.set(false)
        pendingCallback = null
        currentPlacement = null
    }
    
    companion object {
        private const val ERROR_NOT_INITIALIZED = -1
        private const val ERROR_INVALID_CONFIG = -2
        private const val ERROR_UNSUPPORTED_AD_TYPE = -3
    }
}
