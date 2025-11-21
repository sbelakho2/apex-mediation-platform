package com.rivalapexmediation.ctv.ads

import android.os.SystemClock
import com.rivalapexmediation.ctv.network.AuctionWin
import java.util.concurrent.ConcurrentHashMap

internal object AdCache {
    private data class Entry(val win: AuctionWin, val expiryAtMs: Long)
    private val cache = ConcurrentHashMap<String, Entry>()

    fun put(placementId: String, win: AuctionWin) {
        val ttlMillis = win.ttlSeconds.coerceAtLeast(0).toLong() * 1000L
        val expiry = SystemClock.elapsedRealtime() + ttlMillis
        cache[placementId] = Entry(win, expiry)
    }

    fun peek(placementId: String): AuctionWin? {
        val entry = cache[placementId] ?: return null
        return if (entry.expiryAtMs > SystemClock.elapsedRealtime()) entry.win else {
            cache.remove(placementId)
            null
        }
    }

    fun take(placementId: String): AuctionWin? {
        val entry = cache.remove(placementId) ?: return null
        return if (entry.expiryAtMs > SystemClock.elapsedRealtime()) entry.win else null
    }

    fun clear() { cache.clear() }
}
