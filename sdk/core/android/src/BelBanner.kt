package com.rivalapexmediation.sdk

import android.content.Context
import android.graphics.Color
import android.os.Looper
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.webkit.WebSettings
import android.webkit.WebView
import android.widget.FrameLayout
import android.widget.TextView
import com.rivalapexmediation.sdk.models.Creative

/**
 * Simple, stable public API for Banners.
 *
 * This minimal implementation renders a cached banner creative into the provided container.
 * If no banner is cached and test mode is enabled, it renders a safe placeholder.
 *
 * Notes:
 * - Real implementations typically manage auto-refresh and lifecycle; this is an MVP to improve DX now.
 */
object BelBanner {
    @Volatile private var lastPlacement: String? = null

    @JvmStatic
    fun attach(container: ViewGroup, placementId: String) {
        lastPlacement = placementId
        // Must be called on main thread (UI)
        if (Looper.myLooper() != Looper.getMainLooper()) {
            container.post { attach(container, placementId) }
            return
        }
        val sdk = try { MediationSDK.getInstance() } catch (_: Throwable) { null } ?: return
        val ad = sdk.getCachedAd(placementId)
        // Try to render cached banner creative
        if (ad?.creative is Creative.Banner) {
            val banner = ad.creative as Creative.Banner
            val webView = WebView(container.context).apply {
                layoutParams = FrameLayout.LayoutParams(
                    FrameLayout.LayoutParams.MATCH_PARENT,
                    FrameLayout.LayoutParams.WRAP_CONTENT
                )
                settings.javaScriptEnabled = false
                settings.cacheMode = WebSettings.LOAD_NO_CACHE
                setBackgroundColor(Color.TRANSPARENT)
                loadDataWithBaseURL(null, banner.markupHtml, "text/html", "UTF-8", null)
            }
            container.removeAllViews()
            container.addView(webView)
            return
        }
        // Fallback: test mode placeholder to aid integration
        if (sdk.isTestModeEffective()) {
            val tv = TextView(container.context).apply {
                layoutParams = FrameLayout.LayoutParams(
                    FrameLayout.LayoutParams.MATCH_PARENT,
                    FrameLayout.LayoutParams.WRAP_CONTENT
                )
                text = "Bel Banner (test mode) — placement=$placementId"
                setBackgroundColor(Color.parseColor("#EEEEEE"))
                setTextColor(Color.DKGRAY)
                setPadding(16, 16, 16, 16)
                gravity = Gravity.CENTER
            }
            container.removeAllViews()
            container.addView(tv)
        }
    }

    @JvmStatic
    fun detach(container: ViewGroup) {
        // Remove our views if any
        if (Looper.myLooper() == Looper.getMainLooper()) {
            container.removeAllViews()
        } else {
            container.post { container.removeAllViews() }
        }
    }
}
