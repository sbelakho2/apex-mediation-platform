package com.rivalapexmediation.ctv.config

import android.content.Context
import android.content.SharedPreferences
import com.google.gson.Gson
import com.rivalapexmediation.ctv.SDKConfig
import com.rivalapexmediation.ctv.util.Logger
import okhttp3.OkHttpClient
import okhttp3.Request
import java.security.MessageDigest
import java.util.concurrent.TimeUnit
import org.bouncycastle.crypto.params.Ed25519PublicKeyParameters
import org.bouncycastle.crypto.signers.Ed25519Signer
import java.util.Base64

/**
 * OTA config with simple caching. Signature verification is optional and can be added
 * by comparing an attached signature header/body when provided by the backend.
 */
class ConfigManager(private val context: Context, private val config: SDKConfig) {
    private val prefs: SharedPreferences = context.getSharedPreferences("ctv_sdk_cfg", Context.MODE_PRIVATE)
    private val client = OkHttpClient.Builder()
        .connectTimeout(4000, TimeUnit.MILLISECONDS)
        .readTimeout(4000, TimeUnit.MILLISECONDS)
        .build()
    private val gson = Gson()

    data class RemoteConfig(
        val version: Int = 0,
        val placements: Map<String, Any?> = emptyMap(),
        val features: Map<String, Any?> = emptyMap(),
    )

    @Volatile private var current: RemoteConfig? = loadFromCache()

    fun load(): RemoteConfig? {
        // Attempt fetch; on failure keep cache
        val url = config.apiBaseUrl.trimEnd('/') + "/sdk/config?appId=" + config.appId
        try {
            val req = Request.Builder().url(url).get().apply {
                config.apiKey?.let { header("Authorization", "Bearer $it") }
            }.build()
            client.newCall(req).execute().use { res ->
                if (!res.isSuccessful) return current
                val body = res.body()?.string() ?: return current
                // Optional signature verification via Ed25519 using header X-Apex-Signature (base64)
                val headerSig = res.header("X-Apex-Signature")
                val pubPem = config.configPublicKeyPem
                if (!pubPem.isNullOrBlank() && !headerSig.isNullOrBlank()) {
                    val ok = try { verifyEd25519(pubPem, body, headerSig) } catch (_: Exception) { false }
                    if (!ok) {
                        Logger.w("CTV Config signature verification failed; keeping cached")
                        return current
                    }
                }
                val rc = gson.fromJson(body, RemoteConfig::class.java)
                current = rc
                saveToCache(body)
                return current
            }
        } catch (e: Exception) {
            Logger.w("CTV Config fetch failed: ${e.message}", e)
            return current
        }
    }

    fun get(): RemoteConfig? = current

    private fun loadFromCache(): RemoteConfig? {
        val json = prefs.getString("json", null) ?: return null
        return try { gson.fromJson(json, RemoteConfig::class.java) } catch (_: Exception) { null }
    }

    private fun saveToCache(json: String) {
        prefs.edit().putString("json", json).putString("hash", sha256(json)).apply()
    }

    private fun sha256(s: String): String = MessageDigest.getInstance("SHA-256").digest(s.toByteArray()).joinToString("") { "%02x".format(it) }

    private fun pemToRawKey(pem: String): ByteArray {
        val base = pem.replace("-----BEGIN PUBLIC KEY-----", "")
            .replace("-----END PUBLIC KEY-----", "")
            .replace("\n", "")
            .replace("\r", "")
            .trim()
        // Works if pem is raw SubjectPublicKeyInfo for Ed25519; for other encodings, parsing would be needed.
        return Base64.getDecoder().decode(base)
    }

    private fun verifyEd25519(publicKeyPem: String, message: String, signatureB64: String): Boolean {
        val raw = pemToRawKey(publicKeyPem)
        val pk = Ed25519PublicKeyParameters(raw, 0)
        val signer = Ed25519Signer()
        signer.init(false, pk)
        val data = message.toByteArray(Charsets.UTF_8)
        signer.update(data, 0, data.size)
        val sig = Base64.getDecoder().decode(signatureB64)
        return signer.verifySignature(sig)
    }
}
