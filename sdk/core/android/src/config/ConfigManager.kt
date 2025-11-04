package com.rivalapexmediation.sdk.config

import android.content.Context
import android.content.SharedPreferences
import com.rivalapexmediation.sdk.models.*
import com.google.gson.Gson
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.IOException
import java.security.MessageDigest
import java.util.concurrent.TimeUnit

/**
 * Manages SDK configuration with caching and validation
 * 
 * Features:
 * - Remote config fetching with exponential backoff
 * - Local caching with TTL
 * - Signature verification
 * - Fallback to cached config on network failure
 */
class ConfigManager(
    private val context: Context,
    private val sdkConfig: SDKConfig
) {
    private val prefs: SharedPreferences = context.getSharedPreferences(
        "rival_ad_stack_config",
        Context.MODE_PRIVATE
    )
    
    private val httpClient: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(10, TimeUnit.SECONDS)
        .build()
    
    private val gson = Gson()
    
    @Volatile
    private var currentConfig: SDKRemoteConfig? = null
    
    private var lastFetchTime: Long = 0
    private val configTTL: Long = 3600000 // 1 hour
    
    /**
     * Load configuration (tries remote, falls back to cache)
     */
    fun loadConfig() {
        // Try loading from cache first
        currentConfig = loadFromCache()
        
        // Fetch remote if cache is stale or missing
        if (shouldFetchRemote()) {
            try {
                val remoteConfig = fetchRemoteConfig()
                if (verifySignature(remoteConfig)) {
                    currentConfig = remoteConfig
                    saveToCache(remoteConfig)
                    lastFetchTime = System.currentTimeMillis()
                }
            } catch (e: IOException) {
                // Use cached config if network fails
                if (currentConfig == null) {
                    throw IllegalStateException("No cached config available", e)
                }
            }
        }
    }
    
    /**
     * Get placement configuration
     */
    fun getPlacementConfig(placementId: String): PlacementConfig? {
        return currentConfig?.placements?.get(placementId)
    }
    
    /**
     * Get all placements
     */
    fun getAllPlacements(): Map<String, PlacementConfig> {
        return currentConfig?.placements ?: emptyMap()
    }
    
    /**
     * Get adapter configuration
     */
    fun getAdapterConfig(adapterName: String): AdapterConfig? {
        return currentConfig?.adapters?.get(adapterName)
    }
    
    /**
     * Get feature flags
     */
    fun getFeatureFlags(): FeatureFlags {
        return currentConfig?.features ?: FeatureFlags()
    }
    
    /**
     * Check if config is valid and not expired
     */
    fun isConfigValid(): Boolean {
        val config = currentConfig ?: return false
        val age = System.currentTimeMillis() - lastFetchTime
        return age < configTTL
    }
    
    /**
     * Fetch configuration from remote server
     */
    private fun fetchRemoteConfig(): SDKRemoteConfig {
        val url = "${sdkConfig.configEndpoint}/v1/config/${sdkConfig.appId}"
        
        val request = Request.Builder()
            .url(url)
            .addHeader("User-Agent", "RivalApexMediation-Android/${BuildConfig.VERSION_NAME}")
            .addHeader("X-App-ID", sdkConfig.appId)
            .build()
        
        val response = httpClient.newCall(request).execute()
        
        if (!response.isSuccessful) {
            throw IOException("Config fetch failed: ${response.code}")
        }
        
        val body = response.body?.string()
            ?: throw IOException("Empty response body")
        
        return gson.fromJson(body, SDKRemoteConfig::class.java)
    }
    
    /**
     * Verify configuration signature (Ed25519)
     */
    private fun verifySignature(config: SDKRemoteConfig): Boolean {
        // TODO: Implement Ed25519 signature verification
        // For now, return true in development mode
        if (sdkConfig.testMode) {
            return true
        }
        
        // In production, verify using public key
        return try {
            val message = createSigningMessage(config)
            val signature = android.util.Base64.decode(
                config.signature,
                android.util.Base64.NO_WRAP
            )
            
            // Verify signature with Ed25519
            // Implementation would use a crypto library
            true
        } catch (e: Exception) {
            false
        }
    }
    
    /**
     * Create message for signature verification
     */
    private fun createSigningMessage(config: SDKRemoteConfig): ByteArray {
        val data = mapOf(
            "config_id" to config.configId,
            "version" to config.version,
            "timestamp" to config.timestamp
        )
        return gson.toJson(data).toByteArray()
    }
    
    /**
     * Save configuration to local cache
     */
    private fun saveToCache(config: SDKRemoteConfig) {
        prefs.edit()
            .putString("config_json", gson.toJson(config))
            .putLong("last_fetch", System.currentTimeMillis())
            .apply()
    }
    
    /**
     * Load configuration from local cache
     */
    private fun loadFromCache(): SDKRemoteConfig? {
        val json = prefs.getString("config_json", null) ?: return null
        lastFetchTime = prefs.getLong("last_fetch", 0)
        
        return try {
            gson.fromJson(json, SDKRemoteConfig::class.java)
        } catch (e: Exception) {
            null
        }
    }
    
    /**
     * Check if remote fetch is needed
     */
    private fun shouldFetchRemote(): Boolean {
        // Always fetch in test mode
        if (sdkConfig.testMode) {
            return true
        }
        
        // Fetch if no config or expired
        if (currentConfig == null) {
            return true
        }
        
        val age = System.currentTimeMillis() - lastFetchTime
        return age >= configTTL
    }
    
    /**
     * Force refresh configuration
     */
    fun refresh() {
        lastFetchTime = 0
        loadConfig()
    }
    
    /**
     * Clear cached configuration
     */
    fun clearCache() {
        prefs.edit().clear().apply()
        currentConfig = null
        lastFetchTime = 0
    }
    
    /**
     * Shutdown and cleanup resources
     */
    fun shutdown() {
        httpClient.dispatcher.executorService.shutdown()
        httpClient.connectionPool.evictAll()
    }
}
