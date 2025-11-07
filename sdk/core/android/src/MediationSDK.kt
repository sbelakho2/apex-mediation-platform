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
import com.rivalapexmediation.sdk.config.ConfigManager
import com.rivalapexmediation.sdk.telemetry.TelemetryCollector
import com.rivalapexmediation.sdk.models.*
import com.rivalapexmediation.sdk.threading.CircuitBreaker
import com.rivalapexmediation.sdk.network.AuctionClient

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
    
    private val configManager = run {
        val keyB64 = config.configPublicKeyBase64
        val keyBytes = if (!keyB64.isNullOrBlank()) decodeBase64Compat(keyB64) else null
        ConfigManager(context, config, null, keyBytes)
    }
    private val telemetry = TelemetryCollector(context, config)
    private val adapterRegistry = AdapterRegistry()
    private val circuitBreakers = mutableMapOf<String, CircuitBreaker>()
    // Simple in-memory ad cache per placement (interstitials): preserves last loaded ad for fast show.
    private data class CachedAd(val ad: Ad, val expiryAtMs: Long)
    private val adCache = mutableMapOf<String, CachedAd>()
    // Consent preferences propagated to auction metadata (GDPR/USP/COPPA/LAT)
    @Volatile private var consentOptions: AuctionClient.ConsentOptions = AuctionClient.ConsentOptions()
    @Volatile private var auctionClient: AuctionClient? = null
    @Volatile private var auctionApiKey: String = ""
    @Volatile private var testModeOverride: Boolean? = null
    @Volatile private var testDeviceId: String? = null

    // Debug/diagnostic getters used by DebugPanel (safe, read-only)
    fun getAppId(): String = config.appId
    fun getPlacements(): List<String> = try { configManager.getAllPlacements().keys.toList() } catch (_: Throwable) { emptyList() }
    fun isTestModeEffective(): Boolean = (testModeOverride ?: config.testMode)
    fun getConsentDebugSummary(): Map<String, Any?> = mapOf(
        "gdpr_applies" to consentOptions.gdprApplies,
        "us_privacy" to consentOptions.usPrivacy,
        "coppa" to consentOptions.coppa,
        "limit_ad_tracking" to consentOptions.limitAdTracking,
    )
    
    /**
     * Enable StrictMode in debug builds to catch threading violations
     */
    private fun setupStrictMode() {
        // Lazily create auction client to avoid overhead on init
        if (auctionClient == null) {
            auctionClient = try {
                AuctionClient(config.auctionEndpoint, apiKey = "")
            } catch (_: Throwable) { null }
        }
        if (BuildConfig.DEBUG) {
            val threadBuilder = StrictMode.ThreadPolicy.Builder()
                .detectNetwork()
                .detectDiskReads()
                .detectDiskWrites()
                .detectCustomSlowCalls()
                .penaltyLog()
            if (config.strictModePenaltyDeath) {
                threadBuilder.penaltyDeath()
            }
            StrictMode.setThreadPolicy(threadBuilder.build())

            val vmBuilder = StrictMode.VmPolicy.Builder()
                .detectLeakedSqlLiteObjects()
                .detectLeakedClosableObjects()
                .detectActivityLeaks()
                .penaltyLog()
            StrictMode.setVmPolicy(vmBuilder.build())
        }
    }
    
    /**
     * Initialize SDK internals on background thread
     */
    // Public: set auction API key for S2S requests (resets client)
    fun setAuctionApiKey(key: String) {
        this.auctionApiKey = key
        this.auctionClient = null // will be recreated lazily
    }

    // Public: set consent and privacy flags to be propagated to auction metadata
    fun setConsent(
        gdprApplies: Boolean? = null,
        consentString: String? = null,
        usPrivacy: String? = null,
        coppa: Boolean? = null,
        limitAdTracking: Boolean? = null,
    ) {
        this.consentOptions = AuctionClient.ConsentOptions(
            gdprApplies = gdprApplies,
            consentString = consentString,
            usPrivacy = usPrivacy,
            coppa = coppa,
            limitAdTracking = limitAdTracking,
        )
    }

    private fun ensureAuctionClient(): AuctionClient {
        val existing = auctionClient
        if (existing != null) return existing
        val created = AuctionClient(config.auctionEndpoint, auctionApiKey)
        auctionClient = created
        return created
    }

    fun setTestModeOverride(enabled: Boolean?) {
        this.testModeOverride = enabled
    }

    fun setTestDeviceId(id: String?) {
        this.testDeviceId = id
    }

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
                telemetry.recordInitialization()
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
                // Check kill switch before any work
                val features = configManager.getFeatureFlags()
                if (features.killSwitch) {
                    telemetry.recordError("killed_by_config", IllegalStateException("kill_switch_active"))
                    postToMainThread { callback.onError(AdError.INTERNAL_ERROR, "kill_switch_active") }
                    return@execute
                }

                // Get placement configuration
                val placementConfig = configManager.getPlacementConfig(placement)
                    ?: throw IllegalArgumentException("Unknown placement: $placement")

                // 1) Try S2S auction first (competitive path). Falls back to adapters on no_fill.
                try {
                    val client = ensureAuctionClient()
                    val meta = mutableMapOf<String, String>()
                    val effectiveTest = testModeOverride ?: config.testMode
                    if (effectiveTest) meta["test_mode"] = "1" else meta["test_mode"] = "0"
                    testDeviceId?.let { if (it.isNotBlank()) meta["test_device"] = it }
                    val opts = AuctionClient.InterstitialOptions(
                        publisherId = config.appId,
                        placementId = placement,
                        floorCpm = placementConfig.floorPrice,
                        adapters = placementConfig.enabledNetworks,
                        metadata = meta,
                        timeoutMs = placementConfig.timeoutMs.toInt().coerceAtLeast(100),
                        auctionType = "header_bidding",
                    )
                    val result = client.requestInterstitial(opts, consentOptions)
                    // Map to Ad model and callback success
                    val ttlMs = computeDefaultExpiryMs(placementConfig)
                    val ad = Ad(
                        id = result.creativeId ?: ("ad-" + System.currentTimeMillis()),
                        placementId = placement,
                        networkName = result.adapter,
                        adType = AdType.INTERSTITIAL,
                        ecpm = result.ecpm,
                        creative = Creative.Banner(width = 0, height = 0, markupHtml = result.adMarkup ?: ""),
                        expiryTimeMs = System.currentTimeMillis() + ttlMs
                    )
                    cacheAd(placement, ad)
                    val latency = System.currentTimeMillis() - startTime
                    telemetry.recordAdLoad(placement, latency, true)
                    postToMainThread { callback.onAdLoaded(ad) }
                    return@execute
                } catch (ae: AuctionClient.AuctionException) {
                    // Map taxonomy to AdError; if no_fill, proceed to adapter fallback; else report error
                    val reason = ae.reason
                    if (reason == "no_fill") {
                        // proceed to adapters
                    } else {
                        val err = when {
                            reason == "timeout" -> AdError.TIMEOUT
                            reason == "network_error" -> AdError.NETWORK_ERROR
                            reason.startsWith("status_") -> AdError.INTERNAL_ERROR
                            else -> AdError.INTERNAL_ERROR
                        }
                        telemetry.recordAdLoad(placement, System.currentTimeMillis() - startTime, false)
                        postToMainThread { callback.onError(err, reason) }
                        return@execute
                    }
                }

                // 2) Adapter fallback: parallel loading with timeouts
                val adapters = getEnabledAdapters(placementConfig)

                if (adapters.isEmpty()) {
                    postToMainThread {
                        callback.onError(AdError.NO_FILL, "No adapters available")
                    }
                    return@execute
                }

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
                    // Cache with TTL for readiness & fast show
                    val cached = bestAd.copy(expiryTimeMs = System.currentTimeMillis() + computeDefaultExpiryMs(placementConfig))
                    cacheAd(placement, cached)
                    val latency = System.currentTimeMillis() - startTime
                    telemetry.recordAdLoad(placement, latency, true)
                    postToMainThread { callback.onAdLoaded(cached) }
                } else {
                    telemetry.recordAdLoad(placement, System.currentTimeMillis() - startTime, false)
                    postToMainThread { callback.onError(AdError.NO_FILL, "No valid bids received") }
                }

            } catch (e: Exception) {
                telemetry.recordError("load_ad_failed", e)
                postToMainThread { callback.onError(AdError.INTERNAL_ERROR, e.message ?: "Unknown error") }
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
        synchronized(adCache) {
            pruneExpiredLocked()
            val cached = adCache[placement]
            return cached != null && System.currentTimeMillis() < cached.expiryAtMs
        }
    }

    // Cache helpers
    private fun cacheAd(placement: String, ad: Ad) {
        val expiry = ad.expiryTimeMs ?: (System.currentTimeMillis() + 60_000L)
        synchronized(adCache) {
            adCache[placement] = CachedAd(ad, expiry)
            pruneExpiredLocked()
        }
    }

    private fun pruneExpiredLocked() {
        val now = System.currentTimeMillis()
        val it = adCache.entries.iterator()
        while (it.hasNext()) {
            val e = it.next()
            if (now >= e.value.expiryAtMs) it.remove()
        }
    }

    private fun computeDefaultExpiryMs(placementConfig: PlacementConfig): Long {
        // If refreshInterval provided, use 2x refresh as TTL; else default to 60 minutes.
        val refreshSec = placementConfig.refreshInterval
        return if (refreshSec != null && refreshSec > 0) (refreshSec * 2L * 1000L) else 60L * 60L * 1000L
    }
    
    /**
     * Shutdown SDK and cleanup resources
     */
    fun getCachedAd(placement: String): Ad? {
        synchronized(adCache) {
            pruneExpiredLocked()
            return adCache[placement]?.ad
        }
    }

    fun consumeCachedAd(placement: String): Ad? {
        synchronized(adCache) {
            pruneExpiredLocked()
            return adCache.remove(placement)?.ad
        }
    }

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
    val auctionEndpoint: String = "https://auction.rivalapexmediation.com",
    // Debug-only: if true, enable StrictMode penaltyDeath. Default false to avoid crashing host apps.
    val strictModePenaltyDeath: Boolean = false,
    // Optional: Base64-encoded Ed25519 public key for config signature verification (non-test builds)
    val configPublicKeyBase64: String? = null,
) {
    class Builder {
        private var appId: String = ""
        private var testMode: Boolean = false
        private var logLevel: LogLevel = LogLevel.INFO
        private var telemetryEnabled: Boolean = true
        private var configEndpoint: String = "https://config.rivalapexmediation.com"
        private var auctionEndpoint: String = "https://auction.rivalapexmediation.com"
        private var strictModePenaltyDeath: Boolean = false
        private var configPublicKeyBase64: String? = null
        
        fun appId(id: String) = apply { this.appId = id }
        fun testMode(enabled: Boolean) = apply { this.testMode = enabled }
        fun logLevel(level: LogLevel) = apply { this.logLevel = level }
        fun telemetryEnabled(enabled: Boolean) = apply { this.telemetryEnabled = enabled }
        fun configEndpoint(url: String) = apply { this.configEndpoint = url }
        fun auctionEndpoint(url: String) = apply { this.auctionEndpoint = url }
        fun strictModePenaltyDeath(enabled: Boolean) = apply { this.strictModePenaltyDeath = enabled }
        fun configPublicKeyBase64(b64: String?) = apply { this.configPublicKeyBase64 = b64 }
        
        fun build() = SDKConfig(
            appId = appId,
            testMode = testMode,
            logLevel = logLevel,
            telemetryEnabled = telemetryEnabled,
            configEndpoint = configEndpoint,
            auctionEndpoint = auctionEndpoint,
            strictModePenaltyDeath = strictModePenaltyDeath,
            configPublicKeyBase64 = configPublicKeyBase64,
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


// Base64 decoder usable from SDK core without relying on specific Android/JVM versions.
private fun decodeBase64Compat(input: String): ByteArray {
    return try {
        java.util.Base64.getDecoder().decode(input)
    } catch (_: Throwable) {
        try {
            android.util.Base64.decode(input, android.util.Base64.DEFAULT)
        } catch (_: Throwable) {
            try {
                java.util.Base64.getUrlDecoder().decode(input)
            } catch (_: Throwable) {
                ByteArray(0)
            }
        }
    }
}
