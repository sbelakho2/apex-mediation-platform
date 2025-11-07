package com.rivalapexmediation.sdk.network

import com.google.gson.Gson
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import java.util.concurrent.TimeUnit

class AuctionClientTest {
    private fun takeRequestOrFail(): okhttp3.mockwebserver.RecordedRequest {
        val req = server.takeRequest(1, java.util.concurrent.TimeUnit.SECONDS)
        return req ?: error("no request recorded")
    }
    private lateinit var server: MockWebServer
    private lateinit var client: AuctionClient

    @Before
    fun setUp() {
        server = MockWebServer()
        server.start()
        val baseUrl = server.url("/").toString().trimEnd('/')
        client = AuctionClient(baseUrl, apiKey = "test-key")
    }

    @After
    fun tearDown() {
        server.shutdown()
    }

    private fun opts(timeoutMs: Int = 800) = AuctionClient.InterstitialOptions(
        publisherId = "pub-1",
        placementId = "pl-1",
        floorCpm = 0.0,
        adapters = listOf("admob"),
        metadata = emptyMap(),
        timeoutMs = timeoutMs,
        auctionType = "header_bidding",
    )

    @Test
    fun success200_parsesWinner() {
        val body = mapOf(
            "winner" to mapOf(
                "adapter_name" to "admob",
                "cpm" to 2.5,
                "currency" to "USD",
                "creative_id" to "cr",
                "ad_markup" to "<div>ad</div>"
            )
        )
        server.enqueue(MockResponse().setResponseCode(200).setBody(Gson().toJson(body)))

        val res = client.requestInterstitial(opts())
        assertEquals("admob", res.adapter)
        assertEquals(2.5, res.ecpm, 0.0001)
        assertEquals("USD", res.currency)
        assertEquals("cr", res.creativeId)
    }

    @Test
    fun noWinnerInBody_mapsToNoFill() {
        val body = mapOf("some" to "field")
        server.enqueue(MockResponse().setResponseCode(200).setBody(Gson().toJson(body)))
        try {
            client.requestInterstitial(opts())
            fail("expected no_fill")
        } catch (e: AuctionClient.AuctionException) {
            assertEquals("no_fill", e.reason)
        }
    }

    @Test
    fun status400_noRetry_andMapsReason() {
        server.enqueue(MockResponse().setResponseCode(400).setBody("bad"))
        try {
            client.requestInterstitial(opts())
            fail("expected status_400")
        } catch (e: AuctionClient.AuctionException) {
            assertEquals("status_400", e.reason)
        }
        // Only one request should have been made
        assertEquals(1, server.requestCount)
    }

    @Test
    fun retryOn5xx_thenSuccess() {
        // First 500, then 200 OK
        server.enqueue(MockResponse().setResponseCode(500).setBody("oops"))
        val body = mapOf("winner" to mapOf("adapter_name" to "meta", "cpm" to 1.1, "currency" to "USD"))
        server.enqueue(MockResponse().setResponseCode(200).setBody(Gson().toJson(body)))

        val res = client.requestInterstitial(opts())
        assertEquals("meta", res.adapter)
        assertEquals(2, server.requestCount)
    }

    @Test
    fun timeoutMapsToTimeout() {
        // Delay the body well beyond timeout
        server.enqueue(
            MockResponse()
                .setResponseCode(200)
                .setBody("{}")
                .setBodyDelay(2, TimeUnit.SECONDS)
        )
        try {
            client.requestInterstitial(opts(timeoutMs = 50))
            fail("expected timeout")
        } catch (e: AuctionClient.AuctionException) {
            assertEquals("timeout", e.reason)
        }
    }

    @Test
    fun consentSerialization_setsMetadataFlags() {
        // Return a no_fill to avoid success path; we'll inspect recorded request
        server.enqueue(MockResponse().setResponseCode(204))
        try {
            client.requestInterstitial(
                opts(),
                AuctionClient.ConsentOptions(
                    gdprApplies = true,
                    consentString = "TCF",
                    usPrivacy = "1YNN",
                    coppa = false,
                    limitAdTracking = true,
                )
            )
            fail("expected no_fill")
        } catch (_: AuctionClient.AuctionException) {
            // expected no_fill
        }
        val recorded = server.takeRequest(1, TimeUnit.SECONDS) ?: error("no request")
        val payload = Gson().fromJson(recorded.body.readUtf8(), Map::class.java)
        @Suppress("UNCHECKED_CAST")
        val meta = payload["metadata"] as Map<String, String>
        assertEquals("1", meta["gdpr_applies"]) // true → "1"
        assertEquals("1YNN", meta["us_privacy"])
        assertEquals("0", meta["coppa"]) // false → "0"
    }

    @Test
    fun headersContainUserAgentAndApiKey() {
        // Return 204 to force no_fill and stop after one request
        server.enqueue(MockResponse().setResponseCode(204))
        try {
            client.requestInterstitial(opts(), AuctionClient.ConsentOptions())
            fail("expected no_fill")
        } catch (_: AuctionClient.AuctionException) { /* expected */ }
        val recorded = takeRequestOrFail()
        val ua = recorded.getHeader("User-Agent")
        val apiKey = recorded.getHeader("X-Api-Key")
        assertNotNull("User-Agent header must be set", ua)
        assertNotNull("X-Api-Key header must be set", apiKey)
        // Basic UA sanity
        require(ua!!.contains("RivalApexMediation-Android")) { "UA should contain SDK tag" }
    }

    @Test
    fun requestIdFormat_isGeneratedAndLooksReasonable() {
        // Force a single request by returning 204 (no_fill)
        server.enqueue(MockResponse().setResponseCode(204))
        try {
            client.requestInterstitial(opts())
            fail("expected no_fill")
        } catch (_: AuctionClient.AuctionException) { /* expected */ }
        val recorded = server.takeRequest(1, TimeUnit.SECONDS) ?: error("no request")
        val payload = Gson().fromJson(recorded.body.readUtf8(), Map::class.java)
        val reqId = payload["request_id"] as? String ?: error("missing request_id")
        // Expect format: android-<millis>-<rand>
        val regex = Regex("^android-\\d{10,}-\\d{1,6}$")
        assertTrue("request_id should match pattern", regex.containsMatchIn(reqId))
    }

    @Test
    fun malformedWinner_missingAdapterOrCpm_mapsToNoFill() {
        // Winner object present but missing critical fields should map to no_fill
        val bodyMissingAdapter = mapOf("winner" to mapOf(
            // "adapter_name" missing
            "cpm" to 1.0,
            "currency" to "USD",
            "creative_id" to "cr",
        ))
        server.enqueue(MockResponse().setResponseCode(200).setBody(Gson().toJson(bodyMissingAdapter)))
        try {
            client.requestInterstitial(opts())
            fail("expected no_fill due to missing adapter_name")
        } catch (e: AuctionClient.AuctionException) {
            assertEquals("no_fill", e.reason)
        }
        // Next: missing cpm
        val bodyMissingCpm = mapOf("winner" to mapOf(
            "adapter_name" to "admob",
            // "cpm" missing
            "currency" to "USD",
            "creative_id" to "cr",
        ))
        server.enqueue(MockResponse().setResponseCode(200).setBody(Gson().toJson(bodyMissingCpm)))
        try {
            client.requestInterstitial(opts())
            fail("expected no_fill due to missing cpm")
        } catch (e: AuctionClient.AuctionException) {
            assertEquals("no_fill", e.reason)
        }
    }
}
}