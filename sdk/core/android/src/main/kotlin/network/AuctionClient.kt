package com.rivalapexmediation.sdk.network

import android.os.Build
import com.google.gson.Gson
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.InterruptedIOException
import java.net.SocketTimeoutException
import java.util.Locale
import java.util.concurrent.TimeUnit

/**
 * Lightweight Auction client for the Android SDK.
 * - No external dependencies beyond OkHttp + Gson (already present).
 * - Builds request JSON aligned with backend schema and Web/iOS SDKs.
 * - Maps outcomes to a normalized error taxonomy: timeout, status_XXX, no_fill, network_error, error.
 * - Single retry with small backoff for transient 5xx/timeouts.
 */
class AuctionClient(
    baseUrl: String,
    private val apiKey: String,
    httpClient: OkHttpClient? = null,
) {
    private val gson = Gson()
    private val base = baseUrl.trimEnd('/')
    private val client: OkHttpClient = (httpClient ?: OkHttpClient()).newBuilder()
        .retryOnConnectionFailure(false)
        .build()

    private fun buildUserAgent(): String {
    val sdkVersion = try { com.rivalapexmediation.sdk.BuildConfig.SDK_VERSION } catch (_: Throwable) { "0.0.0" }
        val osVer = "Android ${Build.VERSION.RELEASE ?: "unknown"}"
        val device = "${Build.MANUFACTURER ?: ""} ${Build.MODEL ?: ""}".trim()
        return "RivalApexMediation-Android/$sdkVersion ($osVer; $device)"
    }

    data class ConsentOptions(
        val gdprApplies: Boolean? = null,
        val consentString: String? = null,
        val usPrivacy: String? = null,
        val coppa: Boolean? = null,
        val limitAdTracking: Boolean? = null,
    )

    data class InterstitialOptions(
        val publisherId: String,
        val placementId: String,
        val floorCpm: Double? = null,
        val adapters: List<String>? = null,
        val metadata: Map<String, String> = emptyMap(),
        val timeoutMs: Int = 800,
        val auctionType: String = "header_bidding",
    )

    data class InterstitialResult(
        val adapter: String,
        val ecpm: Double,
        val currency: String,
        val creativeId: String?,
        val adMarkup: String?,
        val raw: Map<String, Any?>? = null,
    )

    class AuctionException(val reason: String, override val message: String? = null): Exception(message ?: reason)

    /**
     * Requests an interstitial auction synchronously. Throws AuctionException on no-bid or errors.
     * Timeouts are enforced per-call using OkHttp callTimeout/readTimeout based on options.timeoutMs.
     */
    fun requestInterstitial(opts: InterstitialOptions, consent: ConsentOptions? = null): InterstitialResult {
        if (opts.publisherId.isBlank() || opts.placementId.isBlank()) {
            throw AuctionException("invalid_placement", "publisherId/placementId required")
        }
        val timeout = opts.timeoutMs.coerceAtLeast(100)
        val callClient = client.newBuilder()
            .callTimeout(timeout.toLong(), TimeUnit.MILLISECONDS)
            .connectTimeout(timeout.toLong(), TimeUnit.MILLISECONDS)
            .readTimeout(timeout.toLong(), TimeUnit.MILLISECONDS)
            .writeTimeout(timeout.toLong(), TimeUnit.MILLISECONDS)
            .build()

        val requestBody = buildRequestBody(opts, consent)
        val json = gson.toJson(requestBody)
        val req = Request.Builder()
            .url("$base/v1/auction")
            .post(json.toRequestBody("application/json".toMediaType()))
            .addHeader("Content-Type", "application/json")
            .addHeader("Accept", "application/json")
            .addHeader("User-Agent", buildUserAgent())
            .addHeader("X-Api-Key", apiKey)
            .build()

        var attempt = 0
        var lastErr: AuctionException? = null
        while (attempt < 2) { // initial + 1 retry
            attempt++
            val call = callClient.newCall(req)
            try {
                call.execute().use { resp ->
                    val code = resp.code
                    // 204 → no_fill
                    if (code == 204) {
                        throw AuctionException("no_fill")
                    }
                    if (!resp.isSuccessful) {
                        val reason = "status_" + code
                        throw AuctionException(reason)
                    }
                    val bodyStr = resp.body?.string() ?: "{}"
                    @Suppress("UNCHECKED_CAST")
                    val root = gson.fromJson(bodyStr, MutableMap::class.java) as MutableMap<String, Any?>
                    @Suppress("UNCHECKED_CAST")
                    val winner = (root["winner"] as? Map<String, Any?>)
                    if (winner == null) {
                        throw AuctionException("no_fill")
                    }
                    val adapter = (winner["adapter_name"] as? String)
                        ?: (winner["AdapterName"] as? String)
                    val ecpmNum = (winner["cpm"] as? Number)
                        ?: (winner["CPM"] as? Number)
                    if (adapter.isNullOrBlank() || ecpmNum == null) {
                        // Treat missing critical fields as no_fill to avoid crashing integrators on malformed payloads
                        throw AuctionException("no_fill")
                    }
                    val ecpm = ecpmNum.toDouble()
                    val currency = (winner["currency"] as? String)
                        ?: (winner["Currency"] as? String) ?: "USD"
                    val creativeId = (winner["creative_id"] as? String)
                        ?: (winner["CreativeID"] as? String)
                    val adMarkup = (winner["ad_markup"] as? String)
                        ?: (winner["AdMarkup"] as? String)
                    @Suppress("UNCHECKED_CAST")
                    return InterstitialResult(
                        adapter = adapter,
                        ecpm = ecpm,
                        currency = currency,
                        creativeId = creativeId,
                        adMarkup = adMarkup,
                        raw = root as? Map<String, Any?>
                    )
                }
            } catch (e: Exception) {
                val reason = mapExceptionToReason(e)
                val ex = AuctionException(reason, e.message)
                lastErr = ex
                // Retry only for transient reasons and only on first attempt
                if (attempt >= 2 || !isTransient(reason)) break
                try { Thread.sleep((10L..100L).random()) } catch (_: InterruptedException) {}
            } finally {
                // ensure any leaked body closed if exception before .use
                // OkHttp's use{} closes body; nothing extra to do here.
            }
        }
        throw lastErr ?: AuctionException("error")
    }

    private fun isTransient(reason: String): Boolean {
        return reason == "timeout" || reason.startsWith("status_5") || reason == "network_error"
    }

    private fun mapExceptionToReason(e: Exception): String {
        return when (e) {
            is AuctionException -> e.reason
            is SocketTimeoutException -> "timeout"
            is InterruptedIOException -> "timeout"
            else -> {
                val msg = e.message ?: ""
                when {
                    msg.startsWith("status_") -> msg
                    else -> if (isNetworkIOException(e)) "network_error" else "error"
                }
            }
        }
    }

    private fun isNetworkIOException(e: Exception): Boolean {
        // Basic heuristic; OkHttp surfaces IOExceptions for network conditions
        return e is java.io.IOException
    }

    private fun buildRequestBody(opts: InterstitialOptions, consent: ConsentOptions?): Map<String, Any?> {
        val now = System.currentTimeMillis()
        val rand = (0..999_999).random()
        val reqId = "android-$now-$rand"
        val deviceInfo = mapOf(
            "os" to "android",
            "os_version" to (Build.VERSION.RELEASE ?: ""),
            "make" to (Build.MANUFACTURER ?: ""),
            "model" to (Build.MODEL ?: ""),
            "screen_width" to 0,
            "screen_height" to 0,
            "language" to Locale.getDefault().language,
            "timezone" to java.util.TimeZone.getDefault().id,
            "connection_type" to "unknown",
            "ip" to "",
            "user_agent" to "",
        )
        val userInfo = mapOf(
            "advertising_id" to "", // not accessed in SDK core; respect privacy
            "limit_ad_tracking" to (consent?.limitAdTracking ?: false),
            "consent_string" to (consent?.consentString ?: ""),
        )
        val baseMeta = opts.metadata.toMutableMap()
        consent?.gdprApplies?.let { baseMeta["gdpr_applies"] = if (it) "1" else "0" }
        consent?.usPrivacy?.let { baseMeta["us_privacy"] = it }
        consent?.coppa?.let { baseMeta["coppa"] = if (it) "1" else "0" }

        val adapters = if (opts.adapters != null && opts.adapters.isNotEmpty()) opts.adapters
        else listOf("admob", "meta", "unity", "applovin", "ironsource")

        return mapOf(
            "request_id" to reqId,
            "app_id" to opts.publisherId,
            "placement_id" to opts.placementId,
            "ad_type" to "interstitial",
            "device_info" to deviceInfo,
            "user_info" to userInfo,
            "floor_cpm" to (opts.floorCpm ?: 0.0),
            "timeout_ms" to opts.timeoutMs,
            "auction_type" to opts.auctionType,
            "adapters" to adapters,
            "metadata" to baseMeta,
        )
    }
}
