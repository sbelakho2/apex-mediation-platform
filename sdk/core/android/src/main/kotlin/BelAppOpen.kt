package com.rivalapexmediation.sdk

import android.app.Activity
import android.content.Context
import com.rivalapexmediation.sdk.models.Ad
import com.rivalapexmediation.sdk.models.AdType

/**
 * Simple, stable public API for App Open ads (splash-style).
 * Reuses MediationSDK caching and mirrors Interstitial ergonomics.
 */
object BelAppOpen {
    @Volatile private var lastPlacement: String? = null

    @JvmStatic
    fun load(context: Context, placementId: String, listener: AdLoadCallback) {
        lastPlacement = placementId
        MediationSDK.getInstance().loadAd(placementId, listener)
    }

    /** Attempts to show the last loaded App Open ad. Returns true if shown. */
    @JvmStatic
    fun show(activity: Activity): Boolean {
        val placement = lastPlacement ?: return false
        val sdk = MediationSDK.getInstance()
        val ad: Ad = sdk.consumeCachedAd(placement) ?: return false
        if (ad.adType != AdType.APP_OPEN && ad.adType != AdType.INTERSTITIAL) {
            // Fallback to interstitial rendering path for now
        }
        // OM display session for app open
        try {
            com.rivalapexmediation.sdk.measurement.OmSdkRegistry.controller.startDisplaySession(
                activity, placement, ad.networkName, "app_open"
            )
        } catch (_: Throwable) {}
        ad.show(activity)
        try { com.rivalapexmediation.sdk.measurement.OmSdkRegistry.controller.endSession(placement) } catch (_: Throwable) {}
        return true
    }

    @JvmStatic
    fun isReady(): Boolean {
        val placement = lastPlacement ?: return false
        return MediationSDK.getInstance().isAdReady(placement)
    }
}
