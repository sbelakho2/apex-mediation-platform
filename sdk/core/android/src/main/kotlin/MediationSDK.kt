package com.rivalapexmediation.sdk

import android.content.Context
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.StrictMode
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import java.util.concurrent.Callable
import java.util.concurrent.Future
import java.util.concurrent.TimeUnit
import java.util.concurrent.TimeoutException
import kotlinx.coroutines.*
import okhttp3.CertificatePinner
import okhttp3.OkHttpClient
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
        private val devBannerShown = java.util.concurrent.atomic.AtomicBoolean(false)
        
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
        @JvmStatic
        @JvmOverloads
        fun initialize(
            context: Context,
            appId: String,
            config: SDKConfig = SDKConfig.Builder().build()
        ): MediationSDK {
            val effectiveConfig = config.copy(appId = appId)
            return synchronized(this) {
                if (isTestEnvironment()) {
                    instance?.prepareForReplacement()
                    instance = null
                } else {
                    instance?.let { return@synchronized it }
                }

                val created = MediationSDK(
                    context.applicationContext,
                    effectiveConfig
                )
                instance = created
                created.setupStrictMode()
                created.initializeInternal()
                created
            }
        }
        
        fun getInstance(): MediationSDK {
            return instance ?: throw IllegalStateException(
                "SDK not initialized. Call MediationSDK.initialize() first."
            )
        }

        private fun isTestEnvironment(): Boolean {
            println("[debug] isTestRuntime fingerprint=" + Build.FINGERPRINT)
            return Build.FINGERPRINT == "robolectric"
        }
    }
    
    private val configManager = run {
        val keyB64 = config.configPublicKeyBase64
        val keyBytes = if (!keyB64.isNullOrBlank()) decodeBase64Compat(keyB64) else null
        ConfigManager(context, config, null, keyBytes)
    }
    private val telemetry = TelemetryCollector(context, config)
    private val adapterRegistry = AdapterRegistry()
    private val circuitBreakers = ConcurrentHashMap<String, CircuitBreaker>()
    // Simple in-memory ad cache per placement (interstitials): preserves last loaded ad for fast show.
    private data class CachedAd(val ad: Ad, val expiryAtMs: Long)
    private val adCache = mutableMapOf<String, CachedAd>()
    // Consent preferences propagated to auction metadata (GDPR/USP/COPPA/LAT)
    @Volatile private var consentOptions: AuctionClient.ConsentOptions = AuctionClient.ConsentOptions()
    @Volatile private var auctionClient: AuctionClient? = null
    @Volatile private var auctionApiKey: String = ""
    @Volatile private var testModeOverride: Boolean? = null
    @Volatile private var testDeviceId: String? = null
    @Volatile private var adapterConfigProvider: AdapterConfigProvider? = null

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

    /**
     * Inject per-network credentials at runtime (BYO zero-trust handling).
     * Never logged, never sent to S2S when in BYO mode.
     */
    fun setAdapterConfigProvider(provider: AdapterConfigProvider?) {
        adapterConfigProvider = provider
    }

    /**
     * Validate credentials/config for the specified networks without requesting ads.
      * - Executes on background threads; callback is invoked on the main thread.
      * - Never logs or transmits secrets; only sanitized telemetry is emitted.
      */
    fun validateCredentials(networkIds: List<String>? = null, callback: ValidationCallback) {
        val task = Runnable {
            val results = mutableMapOf<String, ValidationResult>()

            // If disabled, short-circuit with a uniform error per requested network (or all registered)
            if (!config.validationModeEnabled) {
                val targets = networkIds?.ifEmpty { null }
                    ?.toSet()
                    ?: adapterRegistry.getRegisteredNetworks().toSet()
                targets.forEach { net ->
                    results[net] = ValidationResult.error(
                        code = "validation_disabled",
                        message = "ValidationMode is disabled in SDKConfig"
                    )
                }
                postToMainThread { callback.onComplete(results) }
                return@Runnable
            }

            val registered = adapterRegistry.getRegisteredNetworks()
            val targets = (networkIds?.ifEmpty { null }?.toSet() ?: registered.toSet())
                .filter { it in registered }

            if (targets.isEmpty()) {
                postToMainThread { callback.onComplete(emptyMap()) }
                return@Runnable
            }

            val futures = targets.mapNotNull { net ->
                val adapter = adapterRegistry.getAdapter(net)
                if (adapter == null || !adapter.isAvailable()) {
                    results[net] = ValidationResult.error("adapter_unavailable", "Adapter not registered or unavailable")
                    null
                } else {
                    networkExecutor.submit(Callable {
                        val creds = adapterConfigProvider?.getCredentials(net) ?: emptyMap()
                        if (creds.isEmpty()) {
                            net to ValidationResult.error("missing_credentials", "No credentials provided for $net")
                        } else {
                            try {
                                val start = System.currentTimeMillis()
                                val vr = adapter.validateConfig(creds)
                                val latency = System.currentTimeMillis() - start
                                val meta: Map<String, Any> = mapOf(
                                    "network" to net,
                                    "hasCreds" to true,
                                    "credKeys" to creds.keys.take(5), // only key names, no values
                                    "latencyMs" to latency
                                )
                                if (vr.success) {
                                    telemetry.recordCredentialValidationSuccess(net, meta)
                                } else {
                                    telemetry.recordCredentialValidationFailure(net, vr.code, vr.message, meta)
                                }
                                net to vr
                            } catch (t: Throwable) {
                                telemetry.recordCredentialValidationFailure(
                                    network = net,
                                    code = "exception",
                                    message = t.message ?: t.javaClass.simpleName,
                                    metadata = mapOf(
                                        "network" to net,
                                        "hasCreds" to creds.isNotEmpty(),
                                        "credKeys" to creds.keys.take(5)
                                    )
                                )
                                net to ValidationResult.error("exception", t.message)
                            }
                        }
                    })
                }
            }

            // Collect with per-task timeout (short; we never make ad requests here)
            futures.forEach { f ->
                try {
                    val (net, res) = f.get(1500, TimeUnit.MILLISECONDS)
                    results[net] = res
                } catch (_: TimeoutException) {
                    // best-effort: we don't cancel the adapter, just mark timeout
                    // We cannot know the network key from the future; run a slow path by skipping
                } catch (_: Exception) {
                    // swallowed; individual task handled its own telemetry
                }
            }

            // Fill any missing due to timeout with a generic code
            targets.forEach { net ->
                if (!results.containsKey(net)) {
                    results[net] = ValidationResult.error("timeout", "Validation timed out")
                }
            }

            postToMainThread { callback.onComplete(results) }
        }
        if (isTestRuntime()) task.run() else backgroundExecutor.execute(task)
    }

    private fun shouldUseS2SForPlacement(@Suppress("UNUSED_PARAMETER") placement: String): Boolean {
        // BYO mode: disable S2S entirely.
        if (config.sdkMode == SdkMode.BYO) return false
        // In HYBRID/MANAGED, only if explicitly enabled and we have API key.
        if (!config.enableS2SWhenCapable) return false
        if (auctionApiKey.isBlank()) return false
        // Optionally, require that all enabled adapters are S2S-capable and that credentials exist.
        // TODO: consult registry/capabilities when available.
        return true
    }

    private fun ensureAuctionClient(): AuctionClient {
        val existing = auctionClient
        if (existing != null) return existing
        val created = AuctionClient(config.auctionEndpoint, auctionApiKey, buildPinnedHttpClientIfEnabled())
        auctionClient = created
        return created
    }

    /**
     * Build an OkHttpClient with Certificate Pinning when enabled via remote feature flags.
     * Returns null when disabled or misconfigured so AuctionClient falls back to its default client.
     */
    private fun buildPinnedHttpClientIfEnabled(): OkHttpClient? {
        return try {
            val features = configManager.getFeatureFlags()
            if (!features.netTlsPinningEnabled) return null
            val pinMap = features.netTlsPinning
            if (pinMap.isEmpty()) return null
            val pinnerBuilder = CertificatePinner.Builder()
            for ((host, pins) in pinMap) {
                if (host.isNullOrBlank()) continue
                pins.forEach { pin ->
                    if (!pin.isNullOrBlank()) {
                        pinnerBuilder.add(host, pin)
                    }
                }
            }
            val pinner = pinnerBuilder.build()
            OkHttpClient.Builder()
                .certificatePinner(pinner)
                .retryOnConnectionFailure(false)
                .build()
        } catch (_: Throwable) {
            null
        }
    }

    fun setTestModeOverride(enabled: Boolean?) {
        this.testModeOverride = enabled
    }

    fun setTestDeviceId(id: String?) {
        this.testDeviceId = id
    }

    private fun initializeInternal() {
        val initTask = Runnable {
            try {
                // Load configuration
                configManager.loadConfig()

                // Initialize adapters
                adapterRegistry.initialize(context)

                // Setup telemetry
                telemetry.start()

                // Record initialization time
                telemetry.recordInitialization()

                // Developer-only banner warning for app-ads.txt issues (flag propagated via remote config).
                // SDK never calls the inspector; this is purely a UI hint controlled by console.
                try {
                    if (BuildConfig.DEBUG && !devBannerShown.get()) {
                        val features = configManager.getFeatureFlags()
                        if (features.devAppAdsInspectorWarn) {
                            devBannerShown.set(true)
                            postToMainThread {
                                try {
                                    android.widget.Toast.makeText(
                                        context,
                                        "app-ads.txt: one or more enabled vendors look misconfigured. See Console → Developer Tools.",
                                        android.widget.Toast.LENGTH_LONG
                                    ).show()
                                } catch (_: Throwable) { /* ignore UI errors */ }
                            }
                        }
                    }
                } catch (_: Throwable) { /* ignore */ }
            } catch (e: Exception) {
                telemetry.recordError("initialization_failed", e)
            }
        }
        if (isTestRuntime()) {
            initTask.run()
        } else {
            backgroundExecutor.execute(initTask)
        }
    }
    
    /**
     * Load an ad for the specified placement
     * 
     * @param placement The ad placement identifier
     * @param callback Callback for ad load result (called on main thread)
     */
    fun loadAd(placement: String, callback: AdLoadCallback) {
        val loadTask = Runnable {
            val startTime = System.currentTimeMillis()
            val traceId = try { java.util.UUID.randomUUID().toString() } catch (_: Throwable) { "trace-${System.currentTimeMillis()}" }

            try {
                // Check kill switch before any work
                val features = configManager.getFeatureFlags()
                if (features.killSwitch) {
                    telemetry.recordError("killed_by_config", IllegalStateException("kill_switch_active"))
                    postToMainThread { callback.onError(AdError.INTERNAL_ERROR, "kill_switch_active") }
                    return@Runnable
                }

                // Get placement configuration
                val placementConfig = configManager.getPlacementConfig(placement)
                if (placementConfig == null) {
                    telemetry.recordError("invalid_placement", IllegalArgumentException("Unknown placement: $placement"))
                    postToMainThread { callback.onError(AdError.INVALID_PLACEMENT, "Unknown placement: $placement") }
                    return@Runnable
                }

                // 1) Try S2S auction first if enabled for this mode; fallback to adapters on no_fill.
                if (shouldUseS2SForPlacement(placement)) {
                    try {
                        telemetry.recordAdapterSpanStart(traceId, placement, "s2s")
                        val s2sStart = System.currentTimeMillis()
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
                        telemetry.recordAdapterSpanFinish(
                            traceId = traceId,
                            placement = placement,
                            adapter = "s2s",
                            outcome = "fill",
                            latencyMs = System.currentTimeMillis() - s2sStart,
                        )
                        postToMainThread { callback.onAdLoaded(ad) }
                        return@Runnable
                    } catch (ae: AuctionClient.AuctionException) {
                        // Map taxonomy to AdError; if no_fill, proceed to adapter fallback; else report error
                        val reason = ae.reason
                        if (reason == "no_fill") {
                            telemetry.recordAdapterSpanFinish(
                                traceId = traceId,
                                placement = placement,
                                adapter = "s2s",
                                outcome = "no_fill",
                                latencyMs = System.currentTimeMillis() - startTime,
                                errorCode = reason,
                                errorMessage = ae.message
                            )
                            // proceed to adapters
                        } else {
                            val err = when {
                                reason == "timeout" -> AdError.TIMEOUT
                                reason == "network_error" -> AdError.NETWORK_ERROR
                                reason.startsWith("status_") -> AdError.INTERNAL_ERROR
                                else -> AdError.INTERNAL_ERROR
                            }
                            telemetry.recordAdLoad(placement, System.currentTimeMillis() - startTime, false)
                            telemetry.recordAdapterSpanFinish(
                                traceId = traceId,
                                placement = placement,
                                adapter = "s2s",
                                outcome = if (reason == "timeout") "timeout" else "error",
                                latencyMs = System.currentTimeMillis() - startTime,
                                errorCode = reason,
                                errorMessage = ae.message
                            )
                            postToMainThread { callback.onError(err, reason) }
                            return@Runnable
                        }
                    }
                }

                // 2) Adapter fallback: parallel loading with timeouts
                val adapters = getEnabledAdapters(placementConfig)

                if (adapters.isEmpty()) {
                    postToMainThread {
                        callback.onError(AdError.NO_FILL, "No adapters available")
                    }
                    return@Runnable
                }

                val futures: List<Future<AdResponse?>> = adapters.map { adapter ->
                    networkExecutor.submit(Callable {
                        val adapterStart = System.currentTimeMillis()
                        telemetry.recordAdapterSpanStart(traceId, placement, adapter.name)
                        try {
                            val resp = loadWithCircuitBreaker(adapter, placement, placementConfig)
                            val latency = System.currentTimeMillis() - adapterStart
                            val outcome = if (resp?.isValid() == true) "fill" else "no_fill"
                            telemetry.recordAdapterSpanFinish(
                                traceId = traceId,
                                placement = placement,
                                adapter = adapter.name,
                                outcome = outcome,
                                latencyMs = latency,
                                metadata = mapOf("path" to "adapter")
                            )
                            resp
                        } catch (t: Throwable) {
                            val latency = System.currentTimeMillis() - adapterStart
                            telemetry.recordAdapterSpanFinish(
                                traceId = traceId,
                                placement = placement,
                                adapter = adapter.name,
                                outcome = "error",
                                latencyMs = latency,
                                errorCode = "exception",
                                errorMessage = t.message,
                                metadata = mapOf("path" to "adapter")
                            )
                            throw t
                        }
                    })
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
        if (isTestRuntime()) {
            loadTask.run()
        } else {
            backgroundExecutor.execute(loadTask)
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
            createCircuitBreaker()
        }
        
        return breaker.execute {
            adapter.loadAd(placement, config)
        }
    }

    private fun createCircuitBreaker(): CircuitBreaker {
        val failureThreshold = config.circuitBreakerFailureThreshold.coerceAtLeast(1)
        val resetTimeoutMs = config.circuitBreakerResetTimeoutMs.coerceAtLeast(1000L)
        val halfOpenMaxAttempts = config.circuitBreakerHalfOpenMaxAttempts.coerceAtLeast(1)

        return CircuitBreaker(
            failureThreshold = failureThreshold,
            resetTimeoutMs = resetTimeoutMs,
            halfOpenMaxAttempts = halfOpenMaxAttempts
        )
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

    private fun isTestRuntime(): Boolean {
        return Companion.isTestEnvironment()
    }

    private fun prepareForReplacement() {
        try { telemetry.stop() } catch (_: Throwable) {}
        try { adapterRegistry.shutdown() } catch (_: Throwable) {}
        try { configManager.shutdown() } catch (_: Throwable) {}
        circuitBreakers.clear()
        synchronized(adCache) { adCache.clear() }
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
data class SDKConfig @JvmOverloads constructor(
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
    val circuitBreakerFailureThreshold: Int = 5,
    val circuitBreakerResetTimeoutMs: Long = 60_000L,
    val circuitBreakerHalfOpenMaxAttempts: Int = 3,
    // SDK operating mode; default BYO per SDK_FIXES.md
    val sdkMode: SdkMode = SdkMode.BYO,
    // When true (and not BYO), permit S2S auctions when capable and properly credentialed
    val enableS2SWhenCapable: Boolean = false,
    // Auto-read consent strings from SharedPreferences (optional)
    val autoConsentReadEnabled: Boolean = false,
    // Enable developer credential validation flows (no ad requests)
    val validationModeEnabled: Boolean = false,
    // P1.9 Observability flags
    val observabilityEnabled: Boolean = false,
    val observabilitySampleRate: Double = 0.1,
    val observabilityMaxQueue: Int = 500,
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
        private var circuitBreakerFailureThreshold: Int = 5
        private var circuitBreakerResetTimeoutMs: Long = 60_000L
        private var circuitBreakerHalfOpenMaxAttempts: Int = 3
        private var sdkMode: SdkMode = SdkMode.BYO
        private var enableS2SWhenCapable: Boolean = false
        private var autoConsentReadEnabled: Boolean = false
        private var validationModeEnabled: Boolean = false
        private var observabilityEnabled: Boolean = false
        private var observabilitySampleRate: Double = 0.1
        private var observabilityMaxQueue: Int = 500
        
        fun appId(id: String) = apply { this.appId = id }
        fun testMode(enabled: Boolean) = apply { this.testMode = enabled }
        fun logLevel(level: LogLevel) = apply { this.logLevel = level }
        fun telemetryEnabled(enabled: Boolean) = apply { this.telemetryEnabled = enabled }
        fun configEndpoint(url: String) = apply { this.configEndpoint = url }
        fun auctionEndpoint(url: String) = apply { this.auctionEndpoint = url }
        fun strictModePenaltyDeath(enabled: Boolean) = apply { this.strictModePenaltyDeath = enabled }
        fun configPublicKeyBase64(b64: String?) = apply { this.configPublicKeyBase64 = b64 }
        fun circuitBreakerThreshold(threshold: Int) = apply { this.circuitBreakerFailureThreshold = threshold }
        fun circuitBreakerResetTimeoutMs(timeoutMs: Long) = apply { this.circuitBreakerResetTimeoutMs = timeoutMs }
        fun circuitBreakerHalfOpenAttempts(attempts: Int) = apply { this.circuitBreakerHalfOpenMaxAttempts = attempts }
        
        fun sdkMode(mode: SdkMode) = apply { this.sdkMode = mode }
        fun enableS2SWhenCapable(enabled: Boolean) = apply { this.enableS2SWhenCapable = enabled }
        fun autoConsentReadEnabled(enabled: Boolean) = apply { this.autoConsentReadEnabled = enabled }
        fun validationModeEnabled(enabled: Boolean) = apply { this.validationModeEnabled = enabled }
        fun observabilityEnabled(enabled: Boolean) = apply { this.observabilityEnabled = enabled }
        fun observabilitySampleRate(rate: Double) = apply { this.observabilitySampleRate = rate }
        fun observabilityMaxQueue(max: Int) = apply { this.observabilityMaxQueue = max }

        fun build() = SDKConfig(
            appId = appId,
            testMode = testMode,
            logLevel = logLevel,
            telemetryEnabled = telemetryEnabled,
            configEndpoint = configEndpoint,
            auctionEndpoint = auctionEndpoint,
            strictModePenaltyDeath = strictModePenaltyDeath,
            configPublicKeyBase64 = configPublicKeyBase64,
            circuitBreakerFailureThreshold = circuitBreakerFailureThreshold,
            circuitBreakerResetTimeoutMs = circuitBreakerResetTimeoutMs,
            circuitBreakerHalfOpenMaxAttempts = circuitBreakerHalfOpenMaxAttempts,
            sdkMode = sdkMode,
            enableS2SWhenCapable = enableS2SWhenCapable,
            autoConsentReadEnabled = autoConsentReadEnabled,
            validationModeEnabled = validationModeEnabled,
            observabilityEnabled = observabilityEnabled,
            observabilitySampleRate = observabilitySampleRate,
            observabilityMaxQueue = observabilityMaxQueue,
        )
    }
}

enum class LogLevel {
    VERBOSE, DEBUG, INFO, WARN, ERROR
}

/**
 * SDK operating modes per SDK_FIXES.md
 */
enum class SdkMode { BYO, HYBRID, MANAGED }

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


// Base64 decoder usable from SDK core across API 21+.
private fun decodeBase64Compat(input: String): ByteArray {
    if (input.isEmpty()) return ByteArray(0)
    // Try URL_SAFE first (common for JWT/public keys), then DEFAULT, then NO_WRAP variants.
    return try {
        android.util.Base64.decode(input, android.util.Base64.URL_SAFE or android.util.Base64.NO_WRAP)
    } catch (_: Throwable) {
        try {
            android.util.Base64.decode(input, android.util.Base64.DEFAULT)
        } catch (_: Throwable) {
            try {
                android.util.Base64.decode(input, android.util.Base64.NO_WRAP)
            } catch (_: Throwable) {
                ByteArray(0)
            }
        }
    }
}

/**
 * Provider interface for runtime adapter credentials (BYO zero-trust).
 */
interface AdapterConfigProvider {
    fun getCredentials(networkId: String): Map<String, String>?
}
