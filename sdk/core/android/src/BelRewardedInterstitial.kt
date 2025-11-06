package com.rivalapexmediation.sdk

import android.app.Activity
import android.content.Context
import com.rivalapexmediation.sdk.models.Ad

/**
 * Simple, stable public API for Rewarded Interstitials.
 * Mirrors BelRewarded/BelInterstitial ergonomics and uses the internal cache.
 */
object BelRewardedInterstitial {
    @Volatile private var lastPlacement: String? = null

    @JvmStatic
    fun load(context: Context, placementId: String, listener: AdLoadCallback) {
        lastPlacement = placementId
        MediationSDK.getInstance().loadAd(placementId, listener)
    }

    /** Attempts to show the last loaded ad. Returns true if an ad was shown. */
    @JvmStatic
    fun show(activity: Activity): Boolean {
        val placement = lastPlacement ?: return false
        val sdk = MediationSDK.getInstance()
        val ad: Ad = sdk.consumeCachedAd(placement) ?: return false
        ad.show(activity)
        return true
    }

    @JvmStatic
    fun isReady(): Boolean {
        val placement = lastPlacement ?: return false
        return MediationSDK.getInstance().isAdReady(placement)
    }
}
