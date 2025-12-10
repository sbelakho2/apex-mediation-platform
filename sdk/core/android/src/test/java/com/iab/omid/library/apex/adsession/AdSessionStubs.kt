package com.iab.omid.library.apex.adsession

import android.view.View
import com.iab.omid.library.apex.TestOmidRecorder

enum class CreativeType { VIDEO, HTML_DISPLAY }
enum class ImpressionType { VIEWABLE }
enum class Owner { NATIVE }
enum class FriendlyObstructionPurpose { OTHER }

data class Partner(val name: String, val version: String) {
    companion object {
        @JvmStatic
        fun createPartner(name: String, version: String): Partner = Partner(name, version)
    }
}

class AdSessionConfiguration private constructor(
    val creativeType: CreativeType,
    val impressionType: ImpressionType,
    val impressionOwner: Owner,
    val mediaEventsOwner: Owner,
    val isolateVerificationScripts: Boolean
) {
    companion object {
        @JvmStatic
        fun createAdSessionConfiguration(
            creativeType: CreativeType,
            impressionType: ImpressionType,
            impressionOwner: Owner,
            mediaEventsOwner: Owner,
            isolateVerificationScripts: Boolean
        ): AdSessionConfiguration {
            return AdSessionConfiguration(creativeType, impressionType, impressionOwner, mediaEventsOwner, isolateVerificationScripts)
        }
    }
}

class AdSessionContext private constructor(
    val partner: Partner,
    val adView: View?,
) {
    companion object {
        @JvmStatic
        fun createNativeAdSessionContext(
            partner: Partner,
            view: View?,
            contentUrl: String?,
            customRefId: String?,
            verificationScriptResources: String?,
            omidJs: String?,
        ): AdSessionContext {
            return AdSessionContext(partner, view)
        }
    }
}

class AdSession private constructor(
    val configuration: AdSessionConfiguration,
    val context: AdSessionContext,
) {
    companion object {
        @JvmStatic
        fun createAdSession(config: AdSessionConfiguration, context: AdSessionContext): AdSession {
            val session = AdSession(config, context)
            TestOmidRecorder.createdSessions.add(session)
            return session
        }
    }

    fun registerAdView(view: View) {
        TestOmidRecorder.registeredViews.add(view)
    }

    fun addFriendlyObstruction(view: View, purpose: FriendlyObstructionPurpose, reason: String?) {
        val list = TestOmidRecorder.friendlyObstructions.getOrPut(this) { mutableListOf() }
        list.add(view)
    }

    fun start() {
        TestOmidRecorder.startedSessions.add(this)
    }

    fun finish() {
        TestOmidRecorder.finishedSessions.add(this)
    }
}

class AdEvents private constructor(private val session: AdSession) {
    companion object {
        @JvmStatic
        fun createAdEvents(session: AdSession): AdEvents = AdEvents(session)
    }

    fun loaded() {
        TestOmidRecorder.loadedEvents += 1
    }

    fun impressionOccurred() {
        TestOmidRecorder.impressionEvents += 1
    }
}
