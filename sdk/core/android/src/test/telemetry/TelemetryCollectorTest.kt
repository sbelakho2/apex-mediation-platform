package com.rivalapexmediation.sdk.telemetry

import android.content.Context
import com.rivalapexmediation.sdk.SDKConfig
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.MockResponse
import io.mockk.mockk
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.util.concurrent.TimeUnit

class TelemetryCollectorTest {
    private lateinit var server: MockWebServer

    @Before
    fun setUp() {
        server = MockWebServer()
        server.start()
    }

    @After
    fun tearDown() {
        server.shutdown()
    }

    @Test
    fun `flushes batch with gzip to telemetry endpoint`() {
        val baseUrl = server.url("/").toString().trimEnd('/')
        // Accept any POST
        server.enqueue(MockResponse().setResponseCode(200).setBody("{}"))

        val cfg = SDKConfig(
            appId = "app-1",
            testMode = true,
            telemetryEnabled = true,
            configEndpoint = baseUrl,
            auctionEndpoint = "http://localhost"
        )
        val ctx = mockk<Context>(relaxed = true)
        val tc = TelemetryCollector(ctx, cfg)
        tc.start()

        // Emit exactly 10 events to trigger immediate flush (batchSize = 10)
        repeat(10) { tc.recordInitialization() }

        val req = server.takeRequest(2, TimeUnit.SECONDS)
        requireNotNull(req) { "Expected a telemetry POST" }
        assertEquals("/v1/telemetry", req.path)
        // Verify gzip header
        assertEquals("gzip", req.getHeader("Content-Encoding"))
        // Body should be non-empty compressed JSON
        val bytes = req.body.readByteArray()
        assertTrue("Expected some compressed payload", bytes.isNotEmpty())
    }
}
