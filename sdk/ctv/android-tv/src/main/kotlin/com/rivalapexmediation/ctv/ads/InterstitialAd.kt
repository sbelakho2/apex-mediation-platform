package com.rivalapexmediation.ctv.ads

import android.app.Activity
import androidx.media3.ui.PlayerView
import com.rivalapexmediation.ctv.ApexMediation
import com.rivalapexmediation.ctv.network.AuctionWin
import com.rivalapexmediation.ctv.render.Beacon
import com.rivalapexmediation.ctv.render.VideoRenderer
import com.rivalapexmediation.ctv.util.Logger

class InterstitialAd(private val placementId: String) {
    @Volatile private var win: AuctionWin? = null
    @Volatile private var loaded = false

    fun load(floorCpm: Double = 0.0, callback: AdLoadCallback) {
        if (!ApexMediation.isInitialized()) { callback.onError("not_initialized"); return }
        val consent = ApexMediation.consent()
        ApexMediation.client().requestBid(placementId, "interstitial", floorCpm, consent) { result ->
            if (result.noFill) { ApexMediation.postMain { callback.onError("no_fill") }; return@requestBid }
            if (result.error != null) { ApexMediation.postMain { callback.onError(result.error) }; return@requestBid }
            win = result.win
            loaded = win != null
            if (loaded) ApexMediation.postMain { callback.onLoaded() } else ApexMediation.postMain { callback.onError("no_fill") }
        }
    }

    fun isReady(): Boolean = loaded && win != null

    /**
     * Show the interstitial into a provided PlayerView (full-screen in host Activity recommended).
     */
    fun show(activity: Activity, playerView: PlayerView, callback: AdShowCallback) {
        val w = win
        if (!isReady() || w == null) { callback.onError("not_ready"); return }
        val renderer = VideoRenderer(activity)
        renderer.attach(playerView)
        try {
            // Fire impression when first frame is rendered
            renderer.play(w.creativeUrl, onReady = {
                try { Beacon.fire(w.tracking.impression) } catch (_: Throwable) {}
                ApexMediation.postMain { callback.onShown() }
            }, onEnded = {
                ApexMediation.postMain { callback.onClosed() }
                renderer.release()
            })
        } catch (e: Exception) {
            Logger.w("Interstitial show error: ${e.message}", e)
            callback.onError("render_error")
        }
    }

    /**
     * Report a user click for this ad (fires signed click beacon).
     */
    fun reportClick() {
        val w = win ?: return
        try { Beacon.fire(w.tracking.click) } catch (_: Throwable) {}
    }
}
