package com.rivalapexmediation.ctv

import android.content.Context
import android.os.Handler
import android.os.Looper
import com.rivalapexmediation.ctv.consent.ConsentData
import com.rivalapexmediation.ctv.consent.ConsentManager
import com.rivalapexmediation.ctv.network.AuctionClient
import com.rivalapexmediation.ctv.util.Logger
import com.rivalapexmediation.ctv.config.ConfigManager

/**
 * Public entry point for the CTV/OTT SDK.
 */
object ApexMediation {
    @Volatile private var initialized = false
    private lateinit var appContext: Context
    private lateinit var cfg: SDKConfig
    private lateinit var consentMgr: ConsentManager
    private lateinit var auctionClient: AuctionClient
    private val mainHandler = Handler(Looper.getMainLooper())
    private var configMgr: ConfigManager? = null

    @JvmStatic
    fun initialize(context: Context, config: SDKConfig, onComplete: ((Boolean) -> Unit)? = null) {
        if (initialized) { onComplete?.let { postMain { it(true) } }; return }
        appContext = context.applicationContext
        cfg = config
        Logger.debug = config.testMode
        consentMgr = ConsentManager(appContext)
        auctionClient = AuctionClient(appContext, cfg)
        // Best-effort OTA config load (safe to fail)
        try {
            configMgr = ConfigManager(appContext, cfg).also { it.load() }
        } catch (_: Throwable) {}
        initialized = true
        postMain { onComplete?.invoke(true) }
    }

    @JvmStatic
    fun isInitialized(): Boolean = initialized

    @JvmStatic
    fun setConsent(consent: ConsentData) {
        ensureInit()
        consentMgr.setConsent(consent)
    }

    internal fun consent() = consentMgr.getConsent()
    internal fun config() = cfg
    internal fun context() = appContext
    internal fun client() = auctionClient
    internal fun remoteConfig() = configMgr?.get()

    private fun ensureInit() {
        if (!initialized) throw IllegalStateException("ApexMediation not initialized")
    }

    internal fun postMain(block: () -> Unit) { if (Looper.myLooper() == Looper.getMainLooper()) block() else mainHandler.post(block) }
}
