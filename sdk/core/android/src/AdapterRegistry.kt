package com.rivalapexmediation.sdk

import android.content.Context
import com.rivalapexmediation.sdk.models.AdAdapter
import java.util.concurrent.ConcurrentHashMap

/**
 * Minimal AdapterRegistry for the Android SDK (AdAdapter-based)
 * - Separate from sdk.core.android.src.adapter.AdapterRegistry which targets a different interface
 * - This registry serves MediationSDK by holding AdAdapter instances and lifecycle management
 */
class AdapterRegistry {
    private val adapters = ConcurrentHashMap<String, AdAdapter>()

    /**
     * Optional initialization hook; kept for API compatibility with MediationSDK.initializeInternal()
     */
    fun initialize(@Suppress("UNUSED_PARAMETER") context: Context) { /* no-op for now */ }

    /**
     * Register an already-constructed adapter instance under a network key.
     */
    fun register(network: String, adapter: AdAdapter) {
        adapters[network] = adapter
    }

    /**
     * Retrieve an adapter by network key.
     */
    fun getAdapter(network: String): AdAdapter? = adapters[network]

    /**
     * List registered networks.
     */
    fun getRegisteredNetworks(): List<String> = adapters.keys().toList()

    /**
     * Shutdown and cleanup all registered adapters.
     */
    fun shutdown() {
        adapters.values.forEach { a ->
            try { a.destroy() } catch (_: Throwable) {}
        }
        adapters.clear()
    }
}
