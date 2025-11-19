package com.rivalapexmediation.adapter.tapjoy

import android.content.Context
import com.rivalapexmediation.sdk.adapter.AdNetworkAdapter
import com.rivalapexmediation.sdk.adapter.AdLoadCallback
import com.rivalapexmediation.sdk.models.Ad
import com.rivalapexmediation.sdk.models.AdType
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Tapjoy Adapter for Rival ApexMediation
 */
class TapjoyAdapter : AdNetworkAdapter {
    override val networkName = "tapjoy"
    override val version = "1.0.0"
    override val minSDKVersion = "1.0.0"
    
    private val isInitialized = AtomicBoolean(false)
    
    override fun initialize(context: Context, config: Map<String, Any>) {
        if (isInitialized.get()) return
        // TODO: Initialize Tapjoy SDK
        // Tapjoy.connect(context, sdkKey, connectFlags, listener)
        isInitialized.set(true)
    }
}
