package com.rivalapexmediation.sdk

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.os.StrictMode
import java.util.concurrent.Executors
import java.util.concurrent.CompletableFuture
import java.util.concurrent.TimeUnit
import java.util.concurrent.TimeoutException
import kotlinx.coroutines.*

/**
 * Main entry point for the Rival ApexMediation SDK
 * 
 * Thread-Safety Guarantees:
 * - All network I/O on background threads
 * - UI thread only for view rendering
 * - StrictMode enforcement in debug builds
 * - Circuit breakers per adapter
 * 
 * Performance Targets:
 * - Cold start: ≤100ms
 * - Warm start: ≤50ms
 * - ANR contribution: <0.02%
 */
class MediationSDK private constructor(
    private val context: Context,
    private val config: SDKConfig
) {
    companion object {
        @Volatile
        private var instance: MediationSDK? = null
        
        // Thread pools for different operations
        private val backgroundExecutor = Executors.newFixedThreadPool(4) { r ->
            Thread(r, "RivalApexMediation-Background").apply {
                priority = Thread.NORM_PRIORITY - 1
            }
        }
        
        private val networkExecutor = Executors.newCachedThreadPool() { r ->
            Thread(r, "RivalApexMediation-Network").apply {
                priority = Thread.NORM_PRIORITY
            }
        }
        
        private val mainHandler = Handler(Looper.getMainLooper())
        
        /**
         * Initialize the SDK (must be called from Application.onCreate())
         */
        fun initialize(
            context: Context,
            appId: String,
            config: SDKConfig = SDKConfig.Builder().build()
        ): MediationSDK {
            return instance ?: synchronized(this) {
                instance ?: MediationSDK(
                    context.applicationContext,
                    config.copy(appId = appId)
                ).also {
                    instance = it
                    it.setupStrictMode()
                    it.initializeInternal()
                }
            }
        }
        
        fun getInstance(): MediationSDK {
            return instance ?: throw IllegalStateException(
                "SDK not initialized. Call MediationSDK.initialize() first."
            )
        }
    }
    
    private val configManager = ConfigManager(context, config)
    private val telemetry = TelemetryCollector(context, config)
    private val adapterRegistry = AdapterRegistry()
    private val circuitBreakers = mutableMapOf<String, CircuitBreaker>()
    
    /**
     * Enable StrictMode in debug builds to catch threading violations
     */
    private fun setupStrictMode() {
        if (BuildConfig.DEBUG) {
            StrictMode.setThreadPolicy(
                StrictMode.ThreadPolicy.Builder()
                    .detectNetwork()
                    .detectDiskReads()
                    .detectDiskWrites()
                    .detectCustomSlowCalls()
                    .penaltyLog()
                    .penaltyDeath() // Crash immediately on violation
                    .build()
            )
            
            StrictMode.setVmPolicy(
                StrictMode.VmPolicy.Builder()
                    .detectLeakedSqlLiteObjects()
                    .detectLeakedClosableObjects()
                    .detectActivityLeaks()
                    .penaltyLog()
                    .build()
            )
        }
    }
    
    /**
     * Initialize SDK internals on background thread
     */
    private fun initializeInternal() {
        backgroundExecutor.execute {
            try {
                // Load configuration
                configManager.loadConfig()
                
                // Initialize adapters
                adapterRegistry.initialize(context)
                
                // Setup telemetry
                telemetry.start()
                
                // Record initialization time
                telemetry.recordInitialization(System.currentTimeMillis())
            } catch (e: Exception) {
                telemetry.recordError("initialization_failed", e)
            }
        }
    }
    
    /**
     * Load an ad for the specified placement
     * 
     * @param placement The ad placement identifier
     * @param callback Callback for ad load result (called on main thread)
     */
    fun loadAd(placement: String, callback: AdLoadCallback) {
        // All operations on background thread
        backgroundExecutor.execute {
            val startTime = System.currentTimeMillis()
            
            try {
                // Get placement configuration
                val placementConfig = configManager.getPlacementConfig(placement)
                    ?: throw IllegalArgumentException("Unknown placement: $placement")
                
                // Get enabled adapters for this placement
                val adapters = getEnabledAdapters(placementConfig)
                
                if (adapters.isEmpty()) {
                    postToMainThread {
                        callback.onError(AdError.NO_FILL, "No adapters available")
                    }
                    return@execute
                }
                
                // Parallel loading with timeouts
                val futures = adapters.map { adapter ->
                    CompletableFuture.supplyAsync({
                        loadWithCircuitBreaker(adapter, placement, placementConfig)
                    }, networkExecutor)
                }
                
                // Collect results with timeout
                val results = futures.mapNotNull { future ->
                    try {
                        future.get(placementConfig.timeoutMs, TimeUnit.MILLISECONDS)
                    } catch (e: TimeoutException) {
                        telemetry.recordTimeout(placement, "adapter_timeout")
                        null
                    } catch (e: Exception) {
                        telemetry.recordError("adapter_load_failed", e)
                        null
                    }
                }
                
                // Select best ad (highest eCPM)
                val bestAd = selectBestAd(results)
                
                if (bestAd != null) {
                    val latency = System.currentTimeMillis() - startTime
                    telemetry.recordAdLoad(placement, latency, true)
                    
                    postToMainThread {
                        callback.onAdLoaded(bestAd)
                    }
                } else {
                    telemetry.recordAdLoad(placement, System.currentTimeMillis() - startTime, false)
                    
                    postToMainThread {
                        callback.onError(AdError.NO_FILL, "No valid bids received")
                    }
                }
                
            } catch (e: Exception) {
                telemetry.recordError("load_ad_failed", e)
                postToMainThread {
                    callback.onError(AdError.INTERNAL_ERROR, e.message ?: "Unknown error")
                }
            }
        }
    }
    
    /**
     * Load ad with circuit breaker protection
     */
    private fun loadWithCircuitBreaker(
        adapter: AdAdapter,
        placement: String,
        config: PlacementConfig
    ): AdResponse? {
        val breaker = circuitBreakers.getOrPut(adapter.name) {
            CircuitBreaker(
                failureThreshold = 5,
                resetTimeoutMs = 60000
            )
        }
        
        return breaker.execute {
            adapter.loadAd(placement, config)
        }
    }
    
    /**
     * Get adapters enabled for this placement
     */
    private fun getEnabledAdapters(config: PlacementConfig): List<AdAdapter> {
        return config.enabledNetworks.mapNotNull { networkId ->
            adapterRegistry.getAdapter(networkId)
        }.filter { adapter ->
            adapter.isAvailable() && !isAdapterInCircuit(adapter)
        }
    }
    
    /**
     * Check if adapter's circuit breaker is open
     */
    private fun isAdapterInCircuit(adapter: AdAdapter): Boolean {
        return circuitBreakers[adapter.name]?.isOpen() ?: false
    }
    
    /**
     * Select best ad based on eCPM
     */
    private fun selectBestAd(responses: List<AdResponse>): Ad? {
        return responses
            .filter { it.isValid() }
            .maxByOrNull { it.ecpm }
            ?.ad
    }
    
    /**
     * Post runnable to main thread
     */
    private fun postToMainThread(action: () -> Unit) {
        if (Looper.myLooper() == Looper.getMainLooper()) {
            action()
        } else {
            mainHandler.post(action)
        }
    }
    
    /**
     * Check if an ad is ready to show
     */
    fun isAdReady(placement: String): Boolean {
        // This can be called from any thread
        return synchronized(this) {
            // Check internal ad cache
            false // TODO: Implement caching
        }
    }
    
    /**
     * Shutdown SDK and cleanup resources
     */
    fun shutdown() {
        backgroundExecutor.execute {
            telemetry.stop()
            adapterRegistry.shutdown()
            configManager.shutdown()
            
            backgroundExecutor.shutdown()
            networkExecutor.shutdown()
        }
    }
}

/**
 * SDK Configuration
 */
data class SDKConfig(
    val appId: String = "",
    val testMode: Boolean = false,
    val logLevel: LogLevel = LogLevel.INFO,
    val telemetryEnabled: Boolean = true,
    val configEndpoint: String = "https://config.rivalapexmediation.com",
    val auctionEndpoint: String = "https://auction.rivalapexmediation.com"
) {
    class Builder {
        private var appId: String = ""
        private var testMode: Boolean = false
        private var logLevel: LogLevel = LogLevel.INFO
        private var telemetryEnabled: Boolean = true
        
        fun appId(id: String) = apply { this.appId = id }
        fun testMode(enabled: Boolean) = apply { this.testMode = enabled }
        fun logLevel(level: LogLevel) = apply { this.logLevel = level }
        fun telemetryEnabled(enabled: Boolean) = apply { this.telemetryEnabled = enabled }
        
        fun build() = SDKConfig(
            appId = appId,
            testMode = testMode,
            logLevel = logLevel,
            telemetryEnabled = telemetryEnabled
        )
    }
}

enum class LogLevel {
    VERBOSE, DEBUG, INFO, WARN, ERROR
}

/**
 * Ad load callback interface
 */
interface AdLoadCallback {
    fun onAdLoaded(ad: Ad)
    fun onError(error: AdError, message: String)
}

enum class AdError {
    NO_FILL,
    TIMEOUT,
    NETWORK_ERROR,
    INTERNAL_ERROR,
    INVALID_PLACEMENT
}
