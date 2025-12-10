package com.iab.omid.library.apex

import android.content.Context

/**
 * Minimal OMID facade used only in tests to exercise reflection-based helper.
 */
object Omid {
    private var active = false

    @JvmStatic
    fun isActive(): Boolean = active

    @JvmStatic
    fun activate(context: Context) {
        active = true
        TestOmidRecorder.activated += 1
    }
}
