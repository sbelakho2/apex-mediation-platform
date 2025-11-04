package com.apexmediation.sdk

import android.content.Context
import android.os.Handler
import android.os.Looper

object ApexMediation {
    private var initialized = false

    fun initialize(context: Context, apiKey: String, callback: (Result<Unit>) -> Unit) {
        if (apiKey.isBlank()) {
            callback(Result.failure(IllegalArgumentException("Invalid API key")))
            return
        }

        Handler(Looper.getMainLooper()).postDelayed({
            initialized = true
            callback(Result.success(Unit))
        }, 250)
    }

    fun requestInterstitial(placementId: String, callback: (Result<AdFill>) -> Unit) {
        if (!initialized) {
            callback(Result.failure(IllegalStateException("SDK not initialized")))
            return
        }

        if (placementId.isBlank()) {
            callback(Result.failure(IllegalArgumentException("Invalid placement")))
            return
        }

        val fill = AdFill(
            adapter = "admob",
            ecpm = 12.3,
            creativeUrl = "https://ads.apexmediation.com/interstitial.mp4"
        )
        callback(Result.success(fill))
    }
}

data class AdFill(
    val adapter: String,
    val ecpm: Double,
    val creativeUrl: String
)
