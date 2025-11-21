package com.rivalapexmediation.sdk

import android.app.Activity
import android.content.Context
import android.content.res.Configuration
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
import com.rivalapexmediation.sdk.consent.ConsentManager
import com.rivalapexmediation.sdk.contract.AdHandle
import com.rivalapexmediation.sdk.contract.AdapterError
import com.rivalapexmediation.sdk.contract.AdapterConfig as RuntimeAdapterConfig
import com.rivalapexmediation.sdk.contract.AdapterCredentials as RuntimeAdapterCredentials
import com.rivalapexmediation.sdk.contract.AdapterOptions as RuntimeAdapterOptions
import com.rivalapexmediation.sdk.contract.CloseReason
import com.rivalapexmediation.sdk.contract.AttStatus as RuntimeAttStatus
import com.rivalapexmediation.sdk.contract.AuctionMeta as RuntimeAuctionMeta
import com.rivalapexmediation.sdk.contract.ConnectionType as RuntimeConnectionType
import com.rivalapexmediation.sdk.contract.ContextMeta as RuntimeContextMeta
import com.rivalapexmediation.sdk.contract.ConsentState as RuntimeConsentState
import com.rivalapexmediation.sdk.contract.DeviceMeta as RuntimeDeviceMeta
import com.rivalapexmediation.sdk.contract.LoadResult as RuntimeLoadResult
import com.rivalapexmediation.sdk.contract.NetworkMeta as RuntimeNetworkMeta
import com.rivalapexmediation.sdk.contract.Orientation as RuntimeOrientation
import com.rivalapexmediation.sdk.contract.UserMeta as RuntimeUserMeta
import com.rivalapexmediation.sdk.contract.PaidEvent
import com.rivalapexmediation.sdk.contract.RequestMeta as RuntimeRequestMeta
import com.rivalapexmediation.sdk.contract.RewardedCallbacks
import com.rivalapexmediation.sdk.contract.ShowCallbacks
import com.rivalapexmediation.sdk.telemetry.TelemetryCollector
import com.rivalapexmediation.sdk.models.*
import com.rivalapexmediation.sdk.threading.CircuitBreaker
import com.rivalapexmediation.sdk.network.AuctionClient
import java.util.concurrent.atomic.AtomicInteger
import kotlinx.coroutines.runBlocking

/**
 * Main entry point for the Rival ApexMediation SDK
 *
 * BYO guardrails:
 * - Never persist or transmit adapter credentials; only pull them via AdapterConfigProvider.
 * - Default to BYO mode with S2S disabled unless explicitly re-enabled.
 * - Validation mode performs credential pings only; ad loads are blocked while enabled.
 * - All telemetry and cached ads must redact secrets and tag strategy/test metadata for debugging.
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
    private val sessionDepth = AtomicInteger(0)
    private val runtimeHandles = ConcurrentHashMap<String, RuntimeHandleBinding>()
    private val runtimeShowCallbacks = object : RewardedCallbacks {
        override fun onImpression(meta: Map<String, Any?>) {}
        override fun onPaidEvent(event: PaidEvent) {}
        override fun onClick(meta: Map<String, Any?>) {}
        override fun onClosed(reason: CloseReason) {}
        override fun onError(error: AdapterError) {}
        override fun onRewardVerified(rewardType: String, rewardAmount: Double) {}
    }
    private val circuitBreakers = ConcurrentHashMap<String, CircuitBreaker>()
    // Simple in-memory ad cache per placement (interstitials): preserves last loaded ad for fast show.
    private data class CachedAd(val ad: Ad, val expiryAtMs: Long)
    private val adCache = mutableMapOf<String, CachedAd>()
    // Consent preferences propagated to auction metadata (GDPR/USP/COPPA/LAT)
    @Volatile private var consentState: ConsentManager.State = ConsentManager.State()
    @Volatile private var auctionClient: AuctionClient? = null
    @Volatile private var auctionApiKey: String = config.auctionApiKey.orEmpty()
    @Volatile private var testModeOverride: Boolean? = null
    @Volatile private var testDeviceId: String? = null
    @Volatile private var adapterConfigProvider: AdapterConfigProvider? = null

    // Debug/diagnostic getters used by DebugPanel (safe, read-only)
    fun getAppId(): String = config.appId
    fun getPlacements(): List<String> = try { configManager.getAllPlacements().keys.toList() } catch (_: Throwable) { emptyList() }
    fun isTestModeEffective(): Boolean = (testModeOverride ?: config.testMode)
    fun getConsentDebugSummary(): Map<String, Any?> = ConsentManager.debugSummary(consentState)
    
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
        this.consentState = ConsentManager.normalize(
            tcf = consentString,
            usp = usPrivacy,
            gdprApplies = gdprApplies,
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
                if (config.validationModeEnabled) {
                    val message = "ValidationMode is enabled; ad loads are blocked until disabled"
                    telemetry.recordError("validation_mode_blocked", IllegalStateException(message))
                    postToMainThread {
                        callback.onError(AdError.INTERNAL_ERROR, "validation_mode_enabled")
                    }
                    return@Runnable
                }

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
                        telemetry.recordAdapterSpanStart(
                            traceId,
                            placement,
                            "s2s",
                            runtimeTelemetryMetadata(LoadStrategy.S2S)
                        )
                        val s2sStart = System.currentTimeMillis()
                        val client = ensureAuctionClient()
                        val meta = mutableMapOf<String, String>()
                        val effectiveTest = isTestModeEffective()
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
                        val result = client.requestInterstitial(opts, currentAuctionConsent())
                        // Map to Ad model and callback success
                        val ttlMs = computeDefaultExpiryMs(placementConfig)
                        val ad = Ad(
                            id = result.creativeId ?: ("ad-" + System.currentTimeMillis()),
                            placementId = placement,
                            networkName = result.adapter,
                            adType = AdType.INTERSTITIAL,
                            ecpm = result.ecpm,
                            creative = Creative.Banner(width = 0, height = 0, markupHtml = result.adMarkup ?: ""),
                            metadata = buildRuntimeAdMetadata(LoadStrategy.S2S),
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
                            metadata = runtimeTelemetryMetadata(LoadStrategy.S2S)
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
                                errorMessage = ae.message,
                                metadata = runtimeTelemetryMetadata(LoadStrategy.S2S)
                            )
                            // proceed to adapters
                        } else {
                            val err = mapAuctionReasonToAdError(reason)
                            telemetry.recordAdLoad(placement, System.currentTimeMillis() - startTime, false)
                            telemetry.recordAdapterSpanFinish(
                                traceId = traceId,
                                placement = placement,
                                adapter = "s2s",
                                outcome = if (reason == "timeout") "timeout" else "error",
                                latencyMs = System.currentTimeMillis() - startTime,
                                errorCode = reason,
                                errorMessage = ae.message,
                                metadata = runtimeTelemetryMetadata(LoadStrategy.S2S)
                            )
                            postToMainThread { callback.onError(err, ae.message ?: reason) }
                            return@Runnable
                        }
                    }
                }

                // 2) Adapter fallback: prefer runtime V2 adapters, fallback to legacy when needed.
                val runtimeEntries = adapterRegistry.getRuntimeAdapters(placementConfig.enabledNetworks)
                val legacyAdapters = getEnabledAdapters(placementConfig)

                if (runtimeEntries.isEmpty() && legacyAdapters.isEmpty()) {
                    postToMainThread {
                        callback.onError(AdError.NO_FILL, "No adapters available")
                    }
                    return@Runnable
                }

                val futures = mutableListOf<Future<AdapterResult>>()

                runtimeEntries.forEach { entry ->
                    futures += networkExecutor.submit(Callable {
                        val adapterStart = System.currentTimeMillis()
                        val metadata = runtimeTelemetryMetadata(
                            LoadStrategy.CLIENT_ADAPTER,
                            mapOf("path" to "adapter", "api" to "runtime_v2")
                        )
                        telemetry.recordAdapterSpanStart(
                            traceId,
                            placement,
                            entry.partnerId,
                            metadata
                        )
                        try {
                            val payload = loadViaRuntime(entry, placement, placementConfig)
                            val latency = System.currentTimeMillis() - adapterStart
                            val response = payload?.response?.copy(loadTime = latency)
                            val outcome = if (response?.isValid() == true) "fill" else "no_fill"
                            telemetry.recordAdapterSpanFinish(
                                traceId = traceId,
                                placement = placement,
                                adapter = entry.partnerId,
                                outcome = outcome,
                                latencyMs = latency,
                                metadata = metadata
                            )
                            AdapterResult(response, payload?.binding)
                        } catch (t: Throwable) {
                            val latency = System.currentTimeMillis() - adapterStart
                            telemetry.recordAdapterSpanFinish(
                                traceId = traceId,
                                placement = placement,
                                adapter = entry.partnerId,
                                outcome = "error",
                                latencyMs = latency,
                                errorCode = "exception",
                                errorMessage = t.message,
                                metadata = metadata
                            )
                            throw t
                        }
                    })
                }

                legacyAdapters.forEach { adapter ->
                    futures += networkExecutor.submit(Callable {
                        val adapterStart = System.currentTimeMillis()
                        val metadata = runtimeTelemetryMetadata(
                            LoadStrategy.CLIENT_ADAPTER,
                            mapOf("path" to "adapter", "api" to "legacy_v1")
                        )
                        telemetry.recordAdapterSpanStart(traceId, placement, adapter.name, metadata)
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
                                metadata = metadata
                            )
                            AdapterResult(resp, null)
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
                                metadata = metadata
                            )
                            throw t
                        }
                    })
                }

                val adapterResults = mutableListOf<AdapterResult>()
                futures.forEach { future ->
                    try {
                        val result = future.get(placementConfig.timeoutMs, TimeUnit.MILLISECONDS)
                        adapterResults += result
                    } catch (e: TimeoutException) {
                        telemetry.recordTimeout(placement, "adapter_timeout")
                    } catch (e: Exception) {
                        telemetry.recordError("adapter_load_failed", e)
                    }
                }

                val results = adapterResults.mapNotNull { it.response }

                // Select best ad (highest eCPM)
                val bestAd = selectBestAd(results)
                handleRuntimeBindings(adapterResults, bestAd)

                if (bestAd != null) {
                    val expiry = bestAd.expiryTimeMs ?: (System.currentTimeMillis() + computeDefaultExpiryMs(placementConfig))
                    val cached = bestAd.copy(expiryTimeMs = expiry)
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
        clearRuntimeBindings()
        synchronized(adCache) { adCache.clear() }
    }
    
    /**
     * Check if an ad is ready to show.
     *
     * BYO guarantee: cached ads are metadata-rich, single-use, and purged immediately when expired.
     * This allows publishers to gate show() calls deterministically without exposing credentials.
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
            adCache[placement]?.ad?.let { releaseRuntimeBinding(it) }
            adCache[placement] = CachedAd(ad, expiry)
            pruneExpiredLocked()
        }
    }

    private fun pruneExpiredLocked() {
        val now = System.currentTimeMillis()
        val it = adCache.entries.iterator()
        while (it.hasNext()) {
            val e = it.next()
            if (now >= e.value.expiryAtMs) {
                releaseRuntimeBinding(e.value.ad)
                it.remove()
            }
        }
    }

    private fun computeDefaultExpiryMs(placementConfig: PlacementConfig): Long {
        // If refreshInterval provided, use 2x refresh as TTL; else default to 60 minutes.
        val refreshSec = placementConfig.refreshInterval
        return if (refreshSec != null && refreshSec > 0) (refreshSec * 2L * 1000L) else 60L * 60L * 1000L
    }

    private fun loadViaRuntime(
        entry: AdapterRegistry.RuntimeAdapterEntry,
        placement: String,
        placementConfig: PlacementConfig
    ): RuntimeLoadPayload? {
        val adapterConfig = buildRuntimeAdapterConfig(entry.partnerId, placementConfig) ?: return null
        val timeout = placementConfig.timeoutMs.toInt().coerceAtLeast(100)
        val initResult = try {
            entry.ensureInitialized(adapterConfig, timeout)
        } catch (t: Throwable) {
            telemetry.recordError("${entry.partnerId}_init_exception", t)
            return null
        }
        if (!initResult.success) {
            initResult.error?.let { telemetry.recordError("${entry.partnerId}_init_failed", it) }
            return null
        }
        val requestMeta = buildRuntimeRequestMeta(placement, placementConfig)
        val loadResult = runBlocking {
            entry.loadInterstitial(placement, requestMeta, timeout)
        }
        val response = adFromRuntime(placement, placementConfig, entry.partnerId, loadResult)
        val binding = RuntimeHandleBinding(entry.partnerId, loadResult.handle, placementConfig.adType)
        return RuntimeLoadPayload(response, binding)
    }

    private fun buildRuntimeAdapterConfig(networkId: String, placementConfig: PlacementConfig): RuntimeAdapterConfig? {
        val creds = adapterConfigProvider?.getCredentials(networkId)?.takeIf { it.isNotEmpty() } ?: return null
        val key = creds["key"] ?: creds["api_key"] ?: creds["app_key"] ?: return null
        val secret = creds["secret"] ?: creds["app_secret"]
        val appId = creds["app_id"]
        val accountIds = creds
            .filterKeys { it.startsWith("account.") }
            .mapKeys { it.key.removePrefix("account.") }
        val placementKey = "placement.${placementConfig.placementId}"
        val mappedPlacement = creds[placementKey]
            ?: creds["placement_id"]
            ?: placementConfig.placementId
        val placements = mapOf(placementConfig.placementId to mappedPlacement)
        return RuntimeAdapterConfig(
            partner = networkId,
            credentials = RuntimeAdapterCredentials(
                key = key,
                secret = secret,
                appId = appId,
                accountIds = if (accountIds.isEmpty()) null else accountIds
            ),
            placements = placements,
            privacy = buildRuntimeConsentState(),
            options = RuntimeAdapterOptions(
                testMode = isTestModeEffective()
            )
        )
    }

    private fun buildRuntimeConsentState(): RuntimeConsentState = ConsentManager.toRuntimeConsent(consentState)

    private fun currentAuctionConsent(): AuctionClient.ConsentOptions = ConsentManager.toAuctionConsent(consentState)

    private fun buildRuntimeRequestMeta(placement: String, placementConfig: PlacementConfig): RuntimeRequestMeta {
        val consent = buildRuntimeConsentState()
        val device = RuntimeDeviceMeta(
            os = "android",
            osVersion = Build.VERSION.RELEASE ?: "",
            model = Build.MODEL ?: ""
        )
        val user = RuntimeUserMeta(
            ageRestricted = consent.coppa,
            consent = consent
        )
        val net = RuntimeNetworkMeta(
            ipPrefixed = "",
            uaNormalized = "",
            connType = RuntimeConnectionType.OTHER
        )
        val contextMeta = RuntimeContextMeta(
            orientation = determineOrientation(),
            sessionDepth = sessionDepth.incrementAndGet()
        )
        val floorMicros = placementConfig.floorPrice
            .takeIf { it > 0 }
            ?.let { (it * 1_000_000L).toLong() }
        val auction = RuntimeAuctionMeta(
            floorsMicros = floorMicros,
            sChain = null,
            sellersJsonOk = null
        )
        return RuntimeRequestMeta(
            requestId = java.util.UUID.randomUUID().toString(),
            device = device,
            user = user,
            net = net,
            context = contextMeta,
            auction = auction
        )
    }

    private fun determineOrientation(): RuntimeOrientation {
        val orientation = context.resources?.configuration?.orientation
        return if (orientation == Configuration.ORIENTATION_LANDSCAPE) {
            RuntimeOrientation.LANDSCAPE
        } else {
            RuntimeOrientation.PORTRAIT
        }
    }

    private fun adFromRuntime(
        placement: String,
        placementConfig: PlacementConfig,
        partner: String,
        loadResult: RuntimeLoadResult
    ): AdResponse {
        val metadata = buildRuntimeAdMetadata(LoadStrategy.CLIENT_ADAPTER).toMutableMap()
        metadata["runtime_handle"] = loadResult.handle.id
        metadata["runtime_partner"] = partner
        metadata["runtime_api"] = "runtime_v2"
        loadResult.partnerMeta.forEach { (k, v) ->
            metadata["partner_$k"] = v?.toString() ?: ""
        }
        val ttlMs = loadResult.ttlMs.coerceAtLeast(1_000)
        val expiry = System.currentTimeMillis() + ttlMs
        val ecpm = loadResult.priceMicros?.let { it.toDouble() / 1_000_000.0 } ?: 0.0
        val ad = Ad(
            id = loadResult.handle.id,
            placementId = placement,
            networkName = partner,
            adType = placementConfig.adType,
            ecpm = ecpm,
            creative = Creative.Banner(width = 0, height = 0, markupHtml = ""),
            metadata = metadata,
            expiryTimeMs = expiry
        )
        return AdResponse(
            ad = ad,
            ecpm = ecpm,
            loadTime = 0L,
            networkName = partner
        )
    }

    private fun handleRuntimeBindings(results: List<AdapterResult>, winner: Ad?) {
        val winnerHandle = winner?.metadata?.get("runtime_handle")
        results.forEach { result ->
            val binding = result.runtimeBinding ?: return@forEach
            if (winnerHandle != null && binding.handle.id == winnerHandle) {
                registerRuntimeBinding(binding)
            } else {
                adapterRegistry.getRuntimeEntry(binding.partner)?.invalidate(binding.handle)
            }
        }
    }

    private fun registerRuntimeBinding(binding: RuntimeHandleBinding) {
        runtimeHandles[binding.handle.id] = binding
    }

    private fun releaseRuntimeBinding(ad: Ad) {
        val handleId = ad.metadata["runtime_handle"] ?: return
        val binding = runtimeHandles.remove(handleId) ?: return
        adapterRegistry.getRuntimeEntry(binding.partner)?.invalidate(binding.handle)
    }

    private fun clearRuntimeBindings() {
        val bindings = runtimeHandles.values.toList()
        runtimeHandles.clear()
        bindings.forEach { binding ->
            adapterRegistry.getRuntimeEntry(binding.partner)?.invalidate(binding.handle)
        }
    }

    private data class AdapterResult(
        val response: AdResponse?,
        val runtimeBinding: RuntimeHandleBinding?
    )

    private data class RuntimeLoadPayload(
        val response: AdResponse,
        val binding: RuntimeHandleBinding
    )

    private data class RuntimeHandleBinding(
        val partner: String,
        val handle: AdHandle,
        val adType: AdType
    )

    private fun buildRuntimeAdMetadata(strategy: LoadStrategy): Map<String, String> {
        val meta = LinkedHashMap<String, String>()
        meta["strategy"] = strategy.tag
        meta["sdk_mode"] = config.sdkMode.name.lowercase()
        meta["test_mode"] = if (isTestModeEffective()) "1" else "0"
        testDeviceId?.takeIf { it.isNotBlank() }?.let { meta["test_device_id"] = it }
        if (config.validationModeEnabled) meta["validation_mode"] = "1"
        return meta
    }

    private fun runtimeTelemetryMetadata(strategy: LoadStrategy, extra: Map<String, Any> = emptyMap()): Map<String, Any> {
        if (!config.observabilityEnabled) return emptyMap()
        val meta = LinkedHashMap<String, Any>()
        meta["strategy"] = strategy.tag
        meta["sdk_mode"] = config.sdkMode.name.lowercase()
        meta["test_mode"] = if (isTestModeEffective()) "1" else "0"
        if (config.validationModeEnabled) meta["validation_mode"] = "1"
        for ((k, v) in extra) {
            meta[k] = v
        }
        return meta
    }

    private fun mapAuctionReasonToAdError(reason: String?): AdError {
        return when {
            reason == null -> AdError.INTERNAL_ERROR
            reason.equals("timeout", ignoreCase = true) -> AdError.TIMEOUT
            reason.equals("network_error", ignoreCase = true) -> AdError.NETWORK_ERROR
            reason.equals("no_fill", ignoreCase = true) -> AdError.NO_FILL
            reason.equals("below_floor", ignoreCase = true) -> AdError.NO_FILL
            reason.startsWith("status_4", ignoreCase = true) -> AdError.INTERNAL_ERROR
            reason.startsWith("status_5", ignoreCase = true) -> AdError.NETWORK_ERROR
            else -> AdError.INTERNAL_ERROR
        }
    }

    private enum class LoadStrategy(val tag: String) {
        S2S("s2s"),
        CLIENT_ADAPTER("client_sdk")
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

    /**
     * Render a cached ad using the runtime adapter bridge when applicable.
     * Falls back to false when the ad was sourced from S2S.
     */
    fun renderAd(ad: Ad, activity: Activity): Boolean {
        val handleId = ad.metadata["runtime_handle"] ?: return false
        val binding = runtimeHandles[handleId] ?: return false
        val entry = adapterRegistry.getRuntimeEntry(binding.partner)
        if (entry == null) {
            runtimeHandles.remove(handleId)
            return false
        }
        return try {
            when (binding.adType) {
                AdType.REWARDED, AdType.REWARDED_INTERSTITIAL ->
                    entry.showRewarded(binding.handle, activity, runtimeShowCallbacks)
                else -> entry.showInterstitial(binding.handle, activity, runtimeShowCallbacks)
            }
            true
        } catch (t: Throwable) {
            telemetry.recordError("runtime_show_failed", t)
            false
        } finally {
            runtimeHandles.remove(handleId)
            entry.invalidate(binding.handle)
        }
    }

    fun shutdown() {
        backgroundExecutor.execute {
            telemetry.stop()
            adapterRegistry.shutdown()
            configManager.shutdown()
            clearRuntimeBindings()
            
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
    val auctionApiKey: String? = null,
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
        private var auctionApiKey: String? = null
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
        fun auctionApiKey(key: String?) = apply { this.auctionApiKey = key }
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
            auctionApiKey = auctionApiKey,
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
