package com.rivalapexmediation.sdk

import android.app.Activity
import android.content.Context
import androidx.annotation.NonNull
import com.rivalapexmediation.sdk.models.Ad

/**
 * Simple, stable public API for Rewarded Interstitials.
 * Mirrors BelRewarded/BelInterstitial ergonomics and uses the internal cache.
 */
object BelRewardedInterstitial {
    @Volatile private var lastPlacement: String? = null

    @JvmStatic
    fun load(@NonNull context: Context, @NonNull placementId: String, @NonNull listener: AdLoadCallback) {
        lastPlacement = placementId
        MediationSDK.getInstance().loadAd(placementId, listener)
    }

    /** Attempts to show the last loaded ad. Returns true if an ad was shown. */
    @JvmStatic
    fun show(@NonNull activity: Activity): Boolean {
        val placement = lastPlacement ?: return false
        val sdk = MediationSDK.getInstance()
        val ad: Ad = sdk.consumeCachedAd(placement) ?: return false
        // Start OM video session for rewarded interstitials
        try {
            com.rivalapexmediation.sdk.measurement.OmSdkRegistry.controller.startVideoSession(
                activity, placement, ad.networkName, durationSec = null
            )
        } catch (_: Throwable) {}
        // Delegate to ad rendering
        ad.show(activity)
        // End OM session for MVP; real renderer should manage lifecycle
        try { com.rivalapexmediation.sdk.measurement.OmSdkRegistry.controller.endSession(placement) } catch (_: Throwable) {}
        return true
    }

    @JvmStatic
    fun isReady(): Boolean {
        val placement = lastPlacement ?: return false
        return MediationSDK.getInstance().isAdReady(placement)
    }
}
