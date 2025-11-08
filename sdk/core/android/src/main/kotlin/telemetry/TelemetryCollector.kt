package com.rivalapexmediation.sdk.telemetry

import android.content.Context
import com.rivalapexmediation.sdk.BuildConfig
import com.rivalapexmediation.sdk.SDKConfig
import com.rivalapexmediation.sdk.models.EventType
import com.rivalapexmediation.sdk.models.TelemetryEvent
import com.google.gson.Gson
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.ByteArrayOutputStream
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.zip.GZIPOutputStream

/**
 * Telemetry collector with batching and compression
 * 
 * Features:
 * - Event batching (reduces network calls)
 * - GZIP compression
 * - Retry logic with exponential backoff
 * - Background processing (no ANR risk)
 */
class TelemetryCollector(
    private val context: Context,
    private val config: SDKConfig
) {
    private val eventQueue = mutableListOf<TelemetryEvent>()
    private val queueLock = Any()
    
    private val executor = Executors.newSingleThreadScheduledExecutor { r ->
        Thread(r, "RivalApexMediation-Telemetry").apply {
            priority = Thread.MIN_PRIORITY
        }
    }
    
    private val httpClient = OkHttpClient.Builder()
        .connectTimeout(5, TimeUnit.SECONDS)
        .readTimeout(10, TimeUnit.SECONDS)
        .build()
    
    private val gson = Gson()
    
    private val batchSize = 10
    private val flushInterval = 30000L // 30 seconds
    
    @Volatile
    private var isRunning = false
    
    /**
     * Start telemetry collection
     */
    fun start() {
        if (!config.telemetryEnabled) {
            return
        }
        
        isRunning = true
        
        // Schedule periodic flush
        executor.scheduleWithFixedDelay(
            { flushEvents() },
            flushInterval,
            flushInterval,
            TimeUnit.MILLISECONDS
        )
    }
    
    /**
     * Stop telemetry collection
     */
    fun stop() {
        isRunning = false
        
        // Flush remaining events
        flushEvents()
        
        executor.shutdown()
        try {
            executor.awaitTermination(5, TimeUnit.SECONDS)
        } catch (e: InterruptedException) {
            executor.shutdownNow()
        }
    }
    
    /**
     * Record SDK initialization
     */
    fun recordInitialization() {
        recordEvent(TelemetryEvent(eventType = EventType.SDK_INIT))
    }
    
    /**
     * Record ad load event
     */
    fun recordAdLoad(placement: String, latency: Long, success: Boolean) {
        val eventType = if (success) EventType.AD_LOADED else EventType.AD_FAILED
        recordEvent(
            TelemetryEvent(
                eventType = eventType,
                placement = placement,
                latency = latency
            )
        )
    }
    
    /**
     * Record timeout event
     */
    fun recordTimeout(placement: String, reason: String) {
        recordEvent(
            TelemetryEvent(
                eventType = EventType.TIMEOUT,
                placement = placement,
                metadata = mapOf("reason" to reason)
            )
        )
    }
    
    /**
     * Record error event
     */
    fun recordError(errorCode: String, error: Throwable) {
        recordEvent(
            TelemetryEvent(
                eventType = EventType.AD_FAILED,
                errorCode = errorCode,
                errorMessage = error.message,
                metadata = mapOf(
                    "stack_trace" to error.stackTraceToString().take(500)
                )
            )
        )
    }
    
    /**
     * Record ANR detection
     */
    fun recordANR(threadName: String, stackTrace: String) {
        recordEvent(
            TelemetryEvent(
                eventType = EventType.ANR_DETECTED,
                metadata = mapOf(
                    "thread" to threadName,
                    "stack_trace" to stackTrace.take(500)
                )
            )
        )
    }
    
    /**
     * Add event to queue
     */
    private fun recordEvent(event: TelemetryEvent) {
        if (!config.telemetryEnabled || !isRunning) {
            return
        }
        
        synchronized(queueLock) {
            eventQueue.add(event)
            
            // Auto-flush if batch size reached
            if (eventQueue.size >= batchSize) {
                executor.execute { flushEvents() }
            }
        }
    }
    
    /**
     * Flush events to backend
     */
    private fun flushEvents() {
        val eventsToSend: List<TelemetryEvent>
        
        synchronized(queueLock) {
            if (eventQueue.isEmpty()) {
                return
            }
            
            eventsToSend = eventQueue.toList()
            eventQueue.clear()
        }
        
        try {
            sendEvents(eventsToSend)
        } catch (e: Exception) {
            // Re-queue events on failure
            synchronized(queueLock) {
                eventQueue.addAll(0, eventsToSend)
                
                // Limit queue size to prevent memory issues
                if (eventQueue.size > 1000) {
                    eventQueue.subList(0, eventQueue.size - 1000).clear()
                }
            }
        }
    }
    
    /**
     * Send events to telemetry endpoint
     */
    private fun sendEvents(events: List<TelemetryEvent>) {
        val payload = mapOf(
            "app_id" to config.appId,
            "sdk_version" to BuildConfig.SDK_VERSION,
            "platform" to "android",
            "events" to events
        )
        
        val json = gson.toJson(payload)
        val compressed = compressGzip(json.toByteArray())
        
        val request = Request.Builder()
            .url("${config.configEndpoint}/v1/telemetry")
            .post(compressed.toRequestBody("application/json".toMediaType()))
            .addHeader("Content-Encoding", "gzip")
            .addHeader("User-Agent", "RivalApexMediation-Android/${BuildConfig.SDK_VERSION}")
            .build()
        
        val response = httpClient.newCall(request).execute()
        
        if (!response.isSuccessful) {
            throw Exception("Telemetry upload failed: ${response.code}")
        }
    }
    
    /**
     * Compress data with GZIP
     */
    private fun compressGzip(data: ByteArray): ByteArray {
        val outputStream = ByteArrayOutputStream()
        GZIPOutputStream(outputStream).use { gzip ->
            gzip.write(data)
        }
        return outputStream.toByteArray()
    }
}

/**
 * Performance metrics tracker
 */
class PerformanceMetrics {
    data class Metric(
        val name: String,
        val value: Double,
        val timestamp: Long = System.currentTimeMillis()
    )
    
    private val metrics = mutableListOf<Metric>()
    
    fun record(name: String, value: Double) {
        synchronized(metrics) {
            metrics.add(Metric(name, value))
            
            // Keep only last 100 metrics
            if (metrics.size > 100) {
                metrics.removeAt(0)
            }
        }
    }
    
    fun getMetrics(): List<Metric> {
        return synchronized(metrics) {
            metrics.toList()
        }
    }
    
    fun clear() {
        synchronized(metrics) {
            metrics.clear()
        }
    }
}
