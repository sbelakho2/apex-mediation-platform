package com.rivalapexmediation.ctv.network

import android.content.Context
import android.os.Build
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import com.rivalapexmediation.ctv.SDKConfig
import com.rivalapexmediation.ctv.consent.ConsentData
import com.rivalapexmediation.ctv.util.Logger
import okhttp3.*
import java.io.IOException
import java.util.*
import java.util.concurrent.TimeUnit

class AuctionClient(
    private val context: Context,
    private val config: SDKConfig,
    private val gson: Gson = Gson(),
) {
    private val client: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(config.requestTimeoutMs.toLong(), TimeUnit.MILLISECONDS)
        .readTimeout(config.requestTimeoutMs.toLong(), TimeUnit.MILLISECONDS)
        .callTimeout((config.requestTimeoutMs * 2L), TimeUnit.MILLISECONDS)
        .build()

    data class Result(
        val win: AuctionWin?,
        val noFill: Boolean,
        val error: String? = null,
    )

    fun requestBid(
        placementId: String,
        adFormat: String,
        floorCpm: Double,
        consent: ConsentData?,
        callback: (Result) -> Unit,
    ) {
        val requestId = UUID.randomUUID().toString()
        val req = AuctionRequest(
            requestId = requestId,
            placementId = placementId,
            adFormat = adFormat,
            floorCpm = floorCpm,
            device = buildDevice(),
            user = buildUser(),
            app = buildApp(),
            consent = buildConsentMap(consent),
            signal = null,
        )
        val body = RequestBody.create(MediaType.parse("application/json"), gson.toJson(mapOf("body" to req)))
        val url = config.apiBaseUrl.trimEnd('/') + "/rtb/bid"
        val builder = Request.Builder().url(url).post(body)
            .header("Content-Type", "application/json")
        config.apiKey?.let { builder.header("Authorization", "Bearer $it") }
        val httpReq = builder.build()

        client.newCall(httpReq).enqueue(object: Callback {
            override fun onFailure(call: Call, e: IOException) {
                Logger.w("Auction HTTP error: ${e.message}", e)
                callback(Result(null, false, "network_error"))
            }
            override fun onResponse(call: Call, response: Response) {
                response.use { res ->
                    try {
                        if (res.code() == 204) {
                            callback(Result(null, true, null)); return
                        }
                        if (!res.isSuccessful) {
                            // Map simple taxonomy
                            val code = when (res.code()) {
                                400 -> "invalid_request"
                                401 -> "unauthorized"
                                429 -> "rate_limited"
                                in 500..599 -> "server_error"
                                else -> "http_${res.code()}"
                            }
                            callback(Result(null, false, code)); return
                        }
                        val bodyStr = res.body()?.string() ?: "{}"
                        // Response shape may be plain object or envelope depending on server; handle both
                        val mapType = object: TypeToken<Map<String, Any>>(){}.type
                        val parsed: Map<String, Any> = try { gson.fromJson(bodyStr, mapType) } catch (_: Exception) { emptyMap() }
                        val winJson = when {
                            parsed.containsKey("response") -> gson.toJsonTree(parsed["response"]).toString()
                            else -> bodyStr
                        }
                        val win = gson.fromJson(winJson, AuctionWin::class.java)
                        callback(Result(win, false, null))
                    } catch (e: Exception) {
                        Logger.w("Auction parse error: ${e.message}", e)
                        callback(Result(null, false, "parse_error"))
                    }
                }
            }
        })
    }

    private fun buildDevice(): Map<String, Any?> = mapOf(
        "platform" to "android",
        "osVersion" to Build.VERSION.RELEASE,
        "model" to Build.MODEL,
        "tv" to true,
    )

    private fun buildUser(): Map<String, Any?> = emptyMap()

    private fun buildApp(): Map<String, Any?> = mapOf(
        "id" to config.appId,
        "name" to context.applicationInfo.loadLabel(context.packageManager)?.toString(),
        "bundle" to context.packageName,
        "version" to try { context.packageManager.getPackageInfo(context.packageName, 0).versionName } catch (_: Exception) { null }
    )
}
