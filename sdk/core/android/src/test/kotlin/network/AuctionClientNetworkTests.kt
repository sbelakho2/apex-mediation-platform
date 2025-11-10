package com.rivalapexmediation.sdk.network

import com.google.gson.Gson
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.fail
import org.junit.Before
import org.junit.Test
import java.util.concurrent.TimeUnit

class AuctionClientNetworkTests {
    private lateinit var server: MockWebServer

    @Before
    fun setUp() {
        server = MockWebServer()
        server.start()
    }

    @After
    fun tearDown() {
        try { server.shutdown() } catch (_: Throwable) {}
    }

    private fun opts(timeoutMs: Int = 200) = AuctionClient.InterstitialOptions(
        publisherId = "pub-1",
        placementId = "pl-1",
        floorCpm = 0.0,
        adapters = listOf("admob"),
        metadata = emptyMap(),
        timeoutMs = timeoutMs,
        auctionType = "header_bidding",
    )

    @Test
    fun networkIOException_mapsToNetworkError() {
        // Use a server URL and then shut the server down to induce a connection failure (IOException)
        val baseUrl = server.url("/").toString().trimEnd('/')
        val client = AuctionClient(baseUrl, apiKey = "key")
        // Stop server to force connection error
        server.shutdown()
        try {
            client.requestInterstitial(opts())
            fail("expected network_error")
        } catch (e: AuctionClient.AuctionException) {
            // Depending on timing, OkHttp may surface timeout or immediate connect failure; accept either network_error or timeout
            val reason = e.reason
            val ok = (reason == "network_error" || reason == "timeout")
            if (!ok) {
                throw AssertionError("expected network_error or timeout, got $reason")
            }
        }
    }

    @Test
    fun twoConsecutive500s_retryOnce_thenFailWithStatus500() {
        val baseUrl = server.url("/").toString().trimEnd('/')
        val client = AuctionClient(baseUrl, apiKey = "key")
        // Enqueue two 500s to exhaust the single retry
        server.enqueue(MockResponse().setResponseCode(500).setBody("oops1"))
        server.enqueue(MockResponse().setResponseCode(500).setBody("oops2"))
        try {
            client.requestInterstitial(opts())
            fail("expected status_500 after retries")
        } catch (e: AuctionClient.AuctionException) {
            assertEquals("status_500", e.reason)
            // Should have made exactly 2 attempts
            assertEquals(2, server.requestCount)
        }
    }

    @Test
    fun status429_isNotRetried_andMapsReason() {
        val baseUrl = server.url("/").toString().trimEnd('/')
        val client = AuctionClient(baseUrl, apiKey = "key")
        server.enqueue(MockResponse().setResponseCode(429).setBody("rate limited"))
        try {
            client.requestInterstitial(opts())
            fail("expected status_429")
        } catch (e: AuctionClient.AuctionException) {
            assertEquals("status_429", e.reason)
            assertEquals(1, server.requestCount)
        }
    }

    @Test
    fun status400_isNotRetried_andMapsToError() {
        val baseUrl = server.url("/").toString().trimEnd('/')
        val client = AuctionClient(baseUrl, apiKey = "key")
        server.enqueue(MockResponse().setResponseCode(400).setBody("bad request"))
        try {
            client.requestInterstitial(opts())
            fail("expected status_400")
        } catch (e: AuctionClient.AuctionException) {
            assertEquals("status_400", e.reason)
            assertEquals(1, server.requestCount) // No retry for 4xx
        }
    }

    @Test
    fun status404_isNotRetried() {
        val baseUrl = server.url("/").toString().trimEnd('/')
        val client = AuctionClient(baseUrl, apiKey = "key")
        server.enqueue(MockResponse().setResponseCode(404).setBody("not found"))
        try {
            client.requestInterstitial(opts())
            fail("expected status_404")
        } catch (e: AuctionClient.AuctionException) {
            assertEquals("status_404", e.reason)
            assertEquals(1, server.requestCount)
        }
    }

    @Test
    fun status502_retriedOnce() {
        val baseUrl = server.url("/").toString().trimEnd('/')
        val client = AuctionClient(baseUrl, apiKey = "key")
        server.enqueue(MockResponse().setResponseCode(502).setBody("bad gateway"))
        server.enqueue(MockResponse().setResponseCode(502).setBody("still bad"))
        try {
            client.requestInterstitial(opts())
            fail("expected status_502 after retries")
        } catch (e: AuctionClient.AuctionException) {
            assertEquals("status_502", e.reason)
            assertEquals(2, server.requestCount) // Initial + 1 retry
        }
    }

    @Test
    fun status503_retriedOnce() {
        val baseUrl = server.url("/").toString().trimEnd('/')
        val client = AuctionClient(baseUrl, apiKey = "key")
        server.enqueue(MockResponse().setResponseCode(503).setBody("service unavailable"))
        server.enqueue(MockResponse().setResponseCode(503).setBody("still unavailable"))
        try {
            client.requestInterstitial(opts())
            fail("expected status_503 after retries")
        } catch (e: AuctionClient.AuctionException) {
            assertEquals("status_503", e.reason)
            assertEquals(2, server.requestCount)
        }
    }

    @Test
    fun status500_thenSuccess_succeeds() {
        val baseUrl = server.url("/").toString().trimEnd('/')
        val client = AuctionClient(baseUrl, apiKey = "key")
        server.enqueue(MockResponse().setResponseCode(500).setBody("error"))
        server.enqueue(MockResponse().setResponseCode(200).setBody("""
            {
                "auction_id": "test-auction",
                "status": "success",
                "adapter": "test-network",
                "ecpm": 1.5,
                "ad_markup": "<html></html>",
                "creative_id": "creative-1"
            }
        """.trimIndent()))
        
        // Should succeed after retry
        val result = client.requestInterstitial(opts())
        assertEquals("test-network", result.adapter)
        assertEquals(1.5, result.ecpm, 0.001)
        assertEquals(2, server.requestCount) // Initial fail + retry success
    }

    @Test
    fun malformedJson_mapsToError() {
        val baseUrl = server.url("/").toString().trimEnd('/')
        val client = AuctionClient(baseUrl, apiKey = "key")
        server.enqueue(MockResponse().setResponseCode(200).setBody("not valid json {{{"))
        try {
            client.requestInterstitial(opts())
            fail("expected error due to malformed JSON")
        } catch (e: AuctionClient.AuctionException) {
            assertEquals("error", e.reason)
            assertEquals(1, server.requestCount) // Malformed JSON is not retried
        }
    }

    @Test
    fun emptyBody_mapsToError() {
        val baseUrl = server.url("/").toString().trimEnd('/')
        val client = AuctionClient(baseUrl, apiKey = "key")
        server.enqueue(MockResponse().setResponseCode(200).setBody(""))
        try {
            client.requestInterstitial(opts())
            fail("expected error due to empty body")
        } catch (e: AuctionClient.AuctionException) {
            assertEquals("error", e.reason)
            assertEquals(1, server.requestCount)
        }
    }

    @Test
    fun timeout_mapsToTimeoutError() {
        val baseUrl = server.url("/").toString().trimEnd('/')
        val client = AuctionClient(baseUrl, apiKey = "key")
        // Delay response beyond timeout
        server.enqueue(MockResponse().setBodyDelay(500, TimeUnit.MILLISECONDS).setBody("{}"))
        try {
            client.requestInterstitial(opts(timeoutMs = 100))
            fail("expected timeout")
        } catch (e: AuctionClient.AuctionException) {
            assertEquals("timeout", e.reason)
        }
    }

    @Test
    fun status204_noFill_mapsCorrectly() {
        val baseUrl = server.url("/").toString().trimEnd('/')
        val client = AuctionClient(baseUrl, apiKey = "key")
        server.enqueue(MockResponse().setResponseCode(204))
        try {
            client.requestInterstitial(opts())
            fail("expected no_fill")
        } catch (e: AuctionClient.AuctionException) {
            assertEquals("no_fill", e.reason)
            assertEquals(1, server.requestCount)
        }
    }

    @Test
    fun successResponse_parsesCorrectly() {
        val baseUrl = server.url("/").toString().trimEnd('/')
        val client = AuctionClient(baseUrl, apiKey = "key")
        server.enqueue(MockResponse().setResponseCode(200).setBody("""
            {
                "auction_id": "auction-123",
                "status": "success",
                "adapter": "admob",
                "ecpm": 2.5,
                "ad_markup": "<html><body>Ad</body></html>",
                "creative_id": "creative-456"
            }
        """.trimIndent()))
        
        val result = client.requestInterstitial(opts())
        assertEquals("auction-123", result.auctionId)
        assertEquals("success", result.status)
        assertEquals("admob", result.adapter)
        assertEquals(2.5, result.ecpm, 0.001)
        assertEquals("<html><body>Ad</body></html>", result.adMarkup)
        assertEquals("creative-456", result.creativeId)
        assertEquals(1, server.requestCount)
    }
}
