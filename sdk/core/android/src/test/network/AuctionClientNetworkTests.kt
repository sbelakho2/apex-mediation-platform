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
}
