package com.rivalapexmediation.adapter.inmobi

import android.content.Context
import com.rivalapexmediation.sdk.adapter.AdLoadCallback
import com.rivalapexmediation.sdk.adapter.AdNetworkAdapter
import com.rivalapexmediation.sdk.models.Ad
import com.rivalapexmediation.sdk.models.AdType
import com.rivalapexmediation.sdk.models.Creative

class Adapter : AdNetworkAdapter {
    override val networkName: String = "inmobi"
    override val version: String = "1.0.0"
    override val minSDKVersion: String = "1.0.0"

    private var initialized = false

    override fun initialize(context: Context, config: Map<String, Any>) {
        val accountId = config["account_id"] as? String
            ?: throw IllegalArgumentException("account_id required")
        initialized = accountId.isNotBlank()
    }

    override fun loadAd(
        placement: String,
        adType: AdType,
        config: Map<String, Any>,
        callback: AdLoadCallback
    ) {
        if (!initialized) { callback.onAdFailed("Adapter not initialized", -1); return }
        if (!supportsAdType(adType)) { callback.onAdFailed("Unsupported ad type", -2); return }
        val ad = Ad(
            id = "mock-${networkName}-${placement}",
            placementId = placement,
            networkName = networkName,
            adType = adType,
            ecpm = 1.10,
            creative = Creative.Banner(width = 320, height = 50, markupHtml = "<div>InMobi Mock</div>")
        )
        callback.onAdLoaded(ad)
    }

    override fun supportsAdType(adType: AdType): Boolean = when (adType) {
        AdType.BANNER, AdType.INTERSTITIAL, AdType.REWARDED -> true
        else -> false
    }

    override fun destroy() { initialized = false }
}
