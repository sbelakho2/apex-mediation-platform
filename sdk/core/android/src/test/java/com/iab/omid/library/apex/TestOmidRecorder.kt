package com.iab.omid.library.apex

import android.view.View

/**
 * Lightweight recorder used by OMSDK test doubles to validate lifecycle calls.
 */
object TestOmidRecorder {
    val createdSessions = mutableListOf<Any>()
    val registeredViews = mutableListOf<View>()
    val friendlyObstructions = mutableMapOf<Any, MutableList<View>>()
    val startedSessions = mutableListOf<Any>()
    val finishedSessions = mutableListOf<Any>()
    var loadedEvents = 0
    var impressionEvents = 0
    var activated = 0

    fun reset() {
        createdSessions.clear()
        registeredViews.clear()
        friendlyObstructions.clear()
        startedSessions.clear()
        finishedSessions.clear()
        loadedEvents = 0
        impressionEvents = 0
        activated = 0
    }
}
