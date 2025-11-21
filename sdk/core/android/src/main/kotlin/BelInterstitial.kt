package com.rivalapexmediation.sdk

import android.app.Activity
import android.content.Context
import androidx.annotation.NonNull
import com.rivalapexmediation.sdk.models.Ad

/**
 * Simple, stable public API for Interstitials, backed by MediationSDK.
 */
object BelInterstitial {
    @Volatile private var lastPlacement: String? = null

    /**
     * Load an interstitial for the given placement.
     */
    @JvmStatic
    fun load(@NonNull context: Context, @NonNull placementId: String, @NonNull listener: AdLoadCallback) {
        lastPlacement = placementId
        MediationSDK.getInstance().loadAd(placementId, listener)
    }

    /**
     * Attempts to show the last loaded interstitial. Returns true if an ad was shown.
     */
    @JvmStatic
    fun show(@NonNull activity: Activity): Boolean {
        val placement = lastPlacement ?: return false
        val sdk = MediationSDK.getInstance()
        val ad: Ad = sdk.consumeCachedAd(placement) ?: return false
        if (sdk.renderAd(ad, activity)) {
            return true
        }
        // Start OM display session (no-op by default)
        try {
            com.rivalapexmediation.sdk.measurement.OmSdkRegistry.controller.startDisplaySession(
                activity, placement, ad.networkName, "interstitial"
            )
        } catch (_: Throwable) {}
        // Delegate to ad rendering (placeholder for now)
        ad.show(activity)
        // End OM session immediately in this MVP (real renderers should manage lifecycle)
        try { com.rivalapexmediation.sdk.measurement.OmSdkRegistry.controller.endSession(placement) } catch (_: Throwable) {}
        return true
    }

    /**
     * Indicates whether an interstitial is ready for the last loaded placement.
     */
    @JvmStatic
    fun isReady(): Boolean {
        val placement = lastPlacement ?: return false
        return MediationSDK.getInstance().isAdReady(placement)
    }
}
