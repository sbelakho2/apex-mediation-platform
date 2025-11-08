package com.rivalapexmediation.sdk.dx

import android.os.Looper
import com.rivalapexmediation.sdk.interstitial.InterstitialController
import com.rivalapexmediation.sdk.rewarded.RewardedController
import com.rivalapexmediation.sdk.models.Ad
import com.rivalapexmediation.sdk.models.AdType
import com.rivalapexmediation.sdk.models.Creative
import com.rivalapexmediation.sdk.AdError
import android.os.Handler
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.android.asCoroutineDispatcher
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows

@RunWith(RobolectricTestRunner::class)
class MainThreadCallbackTest {

    private fun fakeAd(expireInMs: Long = 60_000): Ad {
        val ttl = if (expireInMs > 0) System.currentTimeMillis() + expireInMs else null
        return Ad(
            id = "ad-x",
            placementId = "placement-x",
            networkName = "test",
            adType = AdType.INTERSTITIAL,
            ecpm = 1.0,
            creative = Creative.Banner(0, 0, "<div/>") ,
            expiryTimeMs = ttl
        )
    }

    @Test
    fun interstitial_onLoaded_isDispatchedOnMainThread() {
        val ctrl = InterstitialController() // default main dispatcher
        var loadedOnMain = false
        var errorCalled = false
        val cb = InterstitialController.Callbacks(
            onLoaded = {
                loadedOnMain = (Looper.myLooper() == Looper.getMainLooper())
            },
            onError = { _: AdError, _: String -> errorCalled = true }
        )
        // Start load on background
        val started = ctrl.load(CoroutineScope(Dispatchers.IO), loader = { fakeAd() }, cb = cb)
        assertTrue(started)
        // Execute queued main-thread tasks
        Shadows.shadowOf(Looper.getMainLooper()).idle()
        assertTrue("onLoaded must be invoked on main thread", loadedOnMain)
        assertFalse("onError must not be called on success", errorCalled)
    }

    @Test
    fun rewarded_onShown_and_onReward_fireOnMainThread() {
        val ctrl = RewardedController() // default main dispatcher
        var shownOnMain = false
        var rewardOnMain = false
        val cb = RewardedController.Callbacks(
            onLoaded = { /* no-op */ },
            onError = { _, _ -> },
            onShown = { shownOnMain = (Looper.myLooper() == Looper.getMainLooper()) },
            onReward = { rewardOnMain = (Looper.myLooper() == Looper.getMainLooper()) },
            onClosed = { }
        )
        // Load
        val started = ctrl.load(CoroutineScope(Dispatchers.IO), loader = { fakeAd() }, cb = cb)
        assertTrue(started)
        // Let main-thread callbacks run for load
        Shadows.shadowOf(Looper.getMainLooper()).idle()
        // Show (callbacks synchronous in stub implementation; assert delivery on main)
        val didShow = ctrl.showIfReady(cb)
        assertTrue(didShow)
        assertTrue("onShown must be invoked on main thread", shownOnMain)
        assertTrue("onReward must be invoked on main thread", rewardOnMain)
    }
}
