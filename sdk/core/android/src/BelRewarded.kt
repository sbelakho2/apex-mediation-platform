package com.rivalapexmediation.sdk

import android.app.Activity
import android.content.Context
import com.rivalapexmediation.sdk.models.Ad

/**
 * Simple, stable public API for Rewarded ads, backed by MediationSDK.
 * Mirrors BelInterstitial ergonomics.
 */
object BelRewarded {
    @Volatile private var lastPlacement: String? = null

    @JvmStatic
    @JvmOverloads
    fun load(context: Context, placementId: String, listener: AdLoadCallback) {
        lastPlacement = placementId
        MediationSDK.getInstance().loadAd(placementId, listener)
    }

    /**
     * Attempts to show the last loaded rewarded ad. Returns true if an ad was shown.
     */
    @JvmStatic
    fun show(activity: Activity): Boolean {
        val placement = lastPlacement ?: return false
        val sdk = MediationSDK.getInstance()
        val ad: Ad = sdk.consumeCachedAd(placement) ?: return false
        ad.show(activity) // Placeholder: real rewarded flow handled by creative/ad renderer
        return true
    }

    @JvmStatic
    fun isReady(): Boolean {
        val placement = lastPlacement ?: return false
        return MediationSDK.getInstance().isAdReady(placement)
    }
}
