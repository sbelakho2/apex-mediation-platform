package com.rivalapexmediation.ctv.config

import android.content.Context
import android.content.SharedPreferences
import com.google.gson.Gson
import com.rivalapexmediation.ctv.SDKConfig
import com.rivalapexmediation.ctv.util.Logger
import okhttp3.OkHttpClient
import okhttp3.Request
import java.security.KeyFactory
import java.security.MessageDigest
import java.security.SecureRandom
import java.security.Signature
import java.security.spec.X509EncodedKeySpec
import java.util.concurrent.TimeUnit
import java.util.Base64

/**
 * OTA config with simple caching. Signature verification is optional and can be added
 * by comparing an attached signature header/body when provided by the backend.
 */
class ConfigManager(private val context: Context, private val config: SDKConfig) {
    companion object {
        private const val PREF_NAME = "ctv_sdk_cfg"
        private const val KEY_JSON = "json"
        private const val KEY_HASH = "hash"
        private const val KEY_PREVIOUS_JSON = "json_prev"
        private const val KEY_ROLLOUT_BUCKET = "rollout_bucket"
        private const val KEY_ACTIVE_VERSION = "config_version"
        private const val KEY_FAILURE_COUNT = "slo_failures"
        private const val FAILURE_THRESHOLD = 5
    }

    private val prefs: SharedPreferences = context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)
    private val client = OkHttpClient.Builder()
        .connectTimeout(4000, TimeUnit.MILLISECONDS)
        .readTimeout(4000, TimeUnit.MILLISECONDS)
        .build()
    private val gson = Gson()
    private val random = SecureRandom()

    data class RemoteFeatures(
        val killSwitch: Boolean = false,
        val disableShow: Boolean = false,
        val metricsEnabled: Boolean = false,
    )

    data class PlacementOverrides(
        val enabledNetworks: List<String> = emptyList(),
        val ttlSeconds: Long? = null,
        val refreshSec: Long? = null,
        val killSwitch: Boolean = false,
    )

    data class RemoteConfig(
        val version: Int = 0,
        val rolloutPercent: Int = 100,
        val placements: Map<String, PlacementOverrides> = emptyMap(),
        val features: RemoteFeatures = RemoteFeatures(),
    )

    @Volatile private var current: RemoteConfig? = loadFromCache()

    fun recordSloSample(success: Boolean) {
        if (success) {
            prefs.edit().putInt(KEY_FAILURE_COUNT, 0).apply()
            return
        }
        val failures = prefs.getInt(KEY_FAILURE_COUNT, 0) + 1
        prefs.edit().putInt(KEY_FAILURE_COUNT, failures).apply()
        if (failures >= FAILURE_THRESHOLD) {
            Logger.w("CTV config auto-rollback triggered after $failures consecutive failures")
            rollbackToPrevious()
            prefs.edit().putInt(KEY_FAILURE_COUNT, 0).apply()
        }
    }

    fun load(): RemoteConfig? {
        // Attempt fetch; on failure keep cache
        val url = config.apiBaseUrl.trimEnd('/') + "/sdk/config?appId=" + config.appId
        try {
            val req = Request.Builder().url(url).get().apply {
                config.apiKey?.let { header("Authorization", "Bearer $it") }
            }.build()
            client.newCall(req).execute().use { res ->
                if (!res.isSuccessful) return current
                val body = res.body?.string() ?: return current
                val headerSig = res.header("x-config-sig") ?: res.header("X-Config-Sig") ?: res.header("X-Apex-Signature")
                val pubPem = config.configPublicKeyPem
                if (!pubPem.isNullOrBlank() && !headerSig.isNullOrBlank()) {
                    val digest = sha256Bytes(body.toByteArray(Charsets.UTF_8))
                    val ok = try { verifyEd25519(pubPem, digest, headerSig) } catch (_: Exception) { false }
                    if (!ok) {
                        Logger.w("CTV Config signature verification failed; keeping cached")
                        return current
                    }
                }
                val rc = gson.fromJson(body, RemoteConfig::class.java)
                if (!shouldAdopt(rc)) {
                    return current
                }
                current = rc
                saveToCache(body, rc.version)
                return current
            }
        } catch (e: Exception) {
            Logger.w("CTV Config fetch failed: ${e.message}", e)
            return current
        }
    }

    fun get(): RemoteConfig? = current

    private fun loadFromCache(): RemoteConfig? {
        val json = prefs.getString(KEY_JSON, null) ?: return null
        return try { gson.fromJson(json, RemoteConfig::class.java) } catch (_: Exception) { null }
    }

    private fun saveToCache(json: String, version: Int) {
        val existing = prefs.getString(KEY_JSON, null)
        val editor = prefs.edit()
        if (!existing.isNullOrBlank() && existing != json) {
            editor.putString(KEY_PREVIOUS_JSON, existing)
        }
        editor.putString(KEY_JSON, json)
            .putString(KEY_HASH, sha256(json))
            .putInt(KEY_ACTIVE_VERSION, version)
            .apply()
    }

    private fun sha256(s: String): String = sha256Bytes(s.toByteArray()).toHex()

    private fun sha256Bytes(data: ByteArray): ByteArray = MessageDigest.getInstance("SHA-256").digest(data)

    private fun ByteArray.toHex(): String = joinToString("") { "%02x".format(it) }

    private fun rolloutBucket(): Int {
        val cached = prefs.getInt(KEY_ROLLOUT_BUCKET, -1)
        if (cached in 0..99) return cached
        val fresh = random.nextInt(100)
        prefs.edit().putInt(KEY_ROLLOUT_BUCKET, fresh).apply()
        return fresh
    }

    private fun shouldAdopt(candidate: RemoteConfig): Boolean {
        val activeVersion = prefs.getInt(KEY_ACTIVE_VERSION, -1)
        if (candidate.version <= activeVersion && current != null) {
            return false
        }
        val percent = candidate.rolloutPercent.coerceIn(0, 100)
        if (percent >= 100) return true
        val bucket = rolloutBucket()
        val adopt = bucket < percent
        if (!adopt) {
            Logger.d("CTV config rollout skipped for bucket $bucket (needs <$percent)")
        }
        return adopt
    }

    private fun rollbackToPrevious() {
        val prev = prefs.getString(KEY_PREVIOUS_JSON, null) ?: return
        try {
            val parsed = gson.fromJson(prev, RemoteConfig::class.java)
            current = parsed
            prefs.edit().putString(KEY_JSON, prev).putInt(KEY_ACTIVE_VERSION, parsed.version).apply()
        } catch (_: Exception) {
            // Ignore malformed fallback
        }
    }

    private fun pemToRawKey(pem: String): ByteArray {
        val base = pem.replace("-----BEGIN PUBLIC KEY-----", "")
            .replace("-----END PUBLIC KEY-----", "")
            .replace("\n", "")
            .replace("\r", "")
            .trim()
        // Works if pem is raw SubjectPublicKeyInfo for Ed25519; for other encodings, parsing would be needed.
        return Base64.getDecoder().decode(base)
    }

    private fun verifyEd25519(publicKeyPem: String, message: ByteArray, signatureB64: String): Boolean {
        val raw = pemToRawKey(publicKeyPem)
        val keyFactory = KeyFactory.getInstance("Ed25519")
        val pubKey = keyFactory.generatePublic(X509EncodedKeySpec(raw))
        val verifier = Signature.getInstance("Ed25519")
        verifier.initVerify(pubKey)
        verifier.update(message)
        val sig = Base64.getDecoder().decode(signatureB64)
        return verifier.verify(sig)
    }
}
