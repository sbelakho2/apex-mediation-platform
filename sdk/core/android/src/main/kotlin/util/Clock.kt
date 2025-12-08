package com.rivalapexmediation.sdk.util

import android.os.SystemClock

/**
 * Clock abstraction to guard against wall-clock drift. Prefer [monotonicNow] for durations/TTL.
 */
interface Clock {
    fun now(): Long
    fun monotonicNow(): Long
}

object SystemClockClock : Clock {
    override fun now(): Long = System.currentTimeMillis()
    override fun monotonicNow(): Long = SystemClock.elapsedRealtime()
}

class FixedClock(private var currentMillis: Long) : Clock {
    override fun now(): Long = currentMillis
    override fun monotonicNow(): Long = currentMillis
    fun advance(millis: Long) { currentMillis += millis }
}
