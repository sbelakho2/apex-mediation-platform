package com.rivalapexmediation.sdk.threading

import java.util.concurrent.atomic.AtomicInteger
import java.util.concurrent.atomic.AtomicLong
import java.util.concurrent.atomic.AtomicReference

/**
 * Circuit Breaker pattern implementation for adapter fault tolerance
 * 
 * States:
 * - CLOSED: Normal operation
 * - OPEN: Too many failures, stop making requests
 * - HALF_OPEN: Testing if service recovered
 * 
 * This prevents cascading failures and protects against misbehaving adapters
 */
class CircuitBreaker(
    private val failureThreshold: Int = 5,
    private val resetTimeoutMs: Long = 60000,
    private val halfOpenMaxAttempts: Int = 3
) {
    private enum class State {
        CLOSED, OPEN, HALF_OPEN
    }
    
    private val state = AtomicReference(State.CLOSED)
    private val failureCount = AtomicInteger(0)
    private val successCount = AtomicInteger(0)
    private val lastFailureTime = AtomicLong(0)
    
    /**
     * Execute action with circuit breaker protection
     */
    fun <T> execute(action: () -> T): T? {
        when (state.get()) {
            State.OPEN -> {
                // Check if we should transition to HALF_OPEN
                if (shouldAttemptReset()) {
                    state.set(State.HALF_OPEN)
                    successCount.set(0)
                } else {
                    // Circuit is open, fail fast
                    return null
                }
            }
            State.HALF_OPEN -> {
                // Limited attempts to test recovery
                if (successCount.get() >= halfOpenMaxAttempts) {
                    // Too many attempts, back to OPEN
                    state.set(State.OPEN)
                    return null
                }
            }
            State.CLOSED -> {
                // Normal operation
            }
        }
        
        return try {
            val result = action()
            onSuccess()
            result
        } catch (e: Exception) {
            onFailure()
            throw e
        }
    }
    
    /**
     * Record successful execution
     */
    private fun onSuccess() {
        when (state.get()) {
            State.HALF_OPEN -> {
                val count = successCount.incrementAndGet()
                if (count >= halfOpenMaxAttempts) {
                    // Enough successes, close the circuit
                    state.set(State.CLOSED)
                    failureCount.set(0)
                }
            }
            State.CLOSED -> {
                // Reset failure count on success
                failureCount.set(0)
            }
            State.OPEN -> {
                // Should not happen
            }
        }
    }
    
    /**
     * Record failed execution
     */
    private fun onFailure() {
        lastFailureTime.set(System.currentTimeMillis())
        
        when (state.get()) {
            State.HALF_OPEN -> {
                // Failed during recovery test, back to OPEN
                state.set(State.OPEN)
                successCount.set(0)
            }
            State.CLOSED -> {
                val count = failureCount.incrementAndGet()
                if (count >= failureThreshold) {
                    // Too many failures, open the circuit
                    state.set(State.OPEN)
                }
            }
            State.OPEN -> {
                // Already open
            }
        }
    }
    
    /**
     * Check if enough time has passed to attempt reset
     */
    private fun shouldAttemptReset(): Boolean {
        val lastFailure = lastFailureTime.get()
        return System.currentTimeMillis() - lastFailure >= resetTimeoutMs
    }
    
    /**
     * Check if circuit breaker is open
     */
    fun isOpen(): Boolean {
        return state.get() == State.OPEN
    }
    
    /**
     * Get current state for monitoring
     */
    fun getState(): String = state.get().name
    
    /**
     * Get failure count for monitoring
     */
    fun getFailureCount(): Int = failureCount.get()
    
    /**
     * Manual reset (for testing/debugging)
     */
    fun reset() {
        state.set(State.CLOSED)
        failureCount.set(0)
        successCount.set(0)
        lastFailureTime.set(0)
    }
}

/**
 * Timeout enforcement wrapper
 */
class TimeoutEnforcer(
    private val timeoutMs: Long
) {
    fun <T> execute(action: () -> T): T {
        val future = java.util.concurrent.CompletableFuture.supplyAsync(action)
        return future.get(timeoutMs, java.util.concurrent.TimeUnit.MILLISECONDS)
    }
}

/**
 * Rate limiter for API calls
 */
class RateLimiter(
    private val maxRequestsPerSecond: Int
) {
    private val timestamps = mutableListOf<Long>()
    
    @Synchronized
    fun acquire(): Boolean {
        val now = System.currentTimeMillis()
        
        // Remove timestamps older than 1 second
        timestamps.removeAll { it < now - 1000 }
        
        if (timestamps.size < maxRequestsPerSecond) {
            timestamps.add(now)
            return true
        }
        
        return false
    }
}
