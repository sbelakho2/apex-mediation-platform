package com.rivalapexmediation.sdk.consent

import android.content.Context
import com.rivalapexmediation.sdk.network.AuctionClient
import com.rivalapexmediation.sdk.privacy.PrivacyIdentifiers
import com.rivalapexmediation.sdk.contract.ConsentState as RuntimeConsentState
import com.rivalapexmediation.sdk.contract.AttStatus as RuntimeAttStatus

/**
 * ConsentManager: helper to normalize app-provided consent strings into SDK options.
 * - Does not auto-read consent; host app remains the source of truth.
 * - Provides simple normalization utilities for TCF v2 (GDPR) and US Privacy (CCPA/CPRA) strings.
 */
object ConsentManager {
    data class State(
        val gdprApplies: Boolean? = null,
        val consentString: String? = null, // TCF v2 string
        val usPrivacy: String? = null,     // IAB US Privacy string (e.g., "1YNN")
        val coppa: Boolean? = null,
        val limitAdTracking: Boolean? = null,
        val privacySandboxOptIn: Boolean? = null,
        val identifiers: IdentifierState = IdentifierState()
    )

    data class IdentifierState(
        val advertisingId: String? = null,
        val appSetId: String? = null,
        val source: IdentifierSource = IdentifierSource.NONE,
        val limitAdTracking: Boolean = true
    )

    enum class IdentifierSource { NONE, GAID, APP_SET }

    /**
     * Normalize app-provided consent inputs to an internal State.
     * - Trims whitespace; empty strings become null.
     * - Does not infer gdprApplies unless explicitly provided.
     */
    fun normalize(
        tcf: String? = null,
        usp: String? = null,
        gdprApplies: Boolean? = null,
        coppa: Boolean? = null,
        limitAdTracking: Boolean? = null,
        privacySandboxOptIn: Boolean? = null,
    ): State {
        val t = tcf?.trim().orEmpty().ifEmpty { null }
        val u = usp?.trim().orEmpty().ifEmpty { null }
        return State(
            gdprApplies = gdprApplies,
            consentString = t,
            usPrivacy = u,
            coppa = coppa,
            limitAdTracking = limitAdTracking,
            privacySandboxOptIn = privacySandboxOptIn,
        )
    }

    /**
     * Optional helper to read standard IAB consent keys from SharedPreferences storage.
     * - Keys read: IABTCF_TCString (String), IABTCF_gdprApplies (Int 0/1), IABUSPrivacy_String (String)
     * - This is opt-in; call this and then setConsent() on the SDK. No background scraping is performed.
     */
    fun fromIabStorage(context: Context): State {
        // Try a couple of common preference files used by CMPs
        val prefsPrimary = context.getSharedPreferences("IABTCF", Context.MODE_PRIVATE)
        val prefsAlt = context.getSharedPreferences(context.packageName + "_preferences", Context.MODE_PRIVATE)
        fun getString(key: String): String? {
            val v1 = prefsPrimary.getString(key, null)
            if (!v1.isNullOrBlank()) return v1
            val v2 = prefsAlt.getString(key, null)
            return v2?.takeIf { it.isNotBlank() }
        }
        fun getInt(key: String): Int? {
            return if (prefsPrimary.contains(key)) prefsPrimary.getInt(key, -1).takeIf { it >= 0 }
            else if (prefsAlt.contains(key)) prefsAlt.getInt(key, -1).takeIf { it >= 0 }
            else null
        }
        val tcf = getString("IABTCF_TCString")
        val gdprInt = getInt("IABTCF_gdprApplies")
        val usp = getString("IABUSPrivacy_String")
        val gdprApplies = when (gdprInt) {
            0 -> false
            1 -> true
            else -> null
        }
        return State(
            gdprApplies = gdprApplies,
            consentString = tcf,
            usPrivacy = usp,
        )
    }

    /** Convert to AuctionClient.ConsentOptions used by the S2S request builder. */
    fun toAuctionConsent(state: State): AuctionClient.ConsentOptions = AuctionClient.ConsentOptions(
        gdprApplies = state.gdprApplies,
        consentString = state.consentString,
        usPrivacy = state.usPrivacy,
        coppa = state.coppa,
        limitAdTracking = state.limitAdTracking,
        privacySandbox = state.privacySandboxOptIn,
        advertisingId = state.identifiers.advertisingId,
        appSetId = state.identifiers.appSetId
    )

    /** Convert to runtime adapter consent payload. */
    fun toRuntimeConsent(state: State): RuntimeConsentState = RuntimeConsentState(
        iabTcfV2 = state.consentString,
        iabUsPrivacy = state.usPrivacy,
        coppa = state.coppa == true,
        attStatus = RuntimeAttStatus.NOT_DETERMINED,
        limitAdTracking = state.limitAdTracking == true,
        privacySandboxOptIn = state.privacySandboxOptIn,
        advertisingId = state.identifiers.advertisingId,
        appSetId = state.identifiers.appSetId
    )

    /** Lightweight debug summary with redacted strings for UI/debugger panels. */
    fun debugSummary(state: State): Map<String, Any?> = mapOf(
        "gdpr_applies" to state.gdprApplies,
        "us_privacy" to state.usPrivacy?.let { redact(it) },
        "tc_string" to state.consentString?.let { redact(it) },
        "coppa" to state.coppa,
        "limit_ad_tracking" to state.limitAdTracking,
        "privacy_sandbox" to state.privacySandboxOptIn,
        "id_source" to state.identifiers.source.name.lowercase(),
        "has_ad_id" to (state.identifiers.advertisingId?.isNotBlank() == true),
        "has_app_set" to (state.identifiers.appSetId?.isNotBlank() == true)
    )

    fun attachIdentifiers(state: State, ids: IdentifierState): State {
        return state.copy(
            identifiers = ids,
            limitAdTracking = if (ids.limitAdTracking) true else state.limitAdTracking
        )
    }

    fun fromPrivacyIdentifiers(ids: PrivacyIdentifiers): IdentifierState {
        val source = when (ids.source) {
            PrivacyIdentifiers.Source.APP_SET -> IdentifierSource.APP_SET
            PrivacyIdentifiers.Source.GAID -> IdentifierSource.GAID
            else -> IdentifierSource.NONE
        }
        return IdentifierState(
            advertisingId = ids.advertisingId,
            appSetId = ids.appSetId,
            source = source,
            limitAdTracking = ids.limitAdTracking
        )
    }

    /**
     * Determines whether we should re-fetch identifiers after a consent update.
     * Triggers when the app explicitly disables LAT and we still lack an ad ID snapshot.
     */
    fun shouldRefetchIdentifiers(previous: State, requestedLimitAdTracking: Boolean?): Boolean {
        if (requestedLimitAdTracking != false) return false
        val wasLatEnabled = (previous.limitAdTracking == true) || previous.identifiers.limitAdTracking
        if (!wasLatEnabled) return false
        return previous.identifiers.advertisingId.isNullOrBlank()
    }

    /** Redact consent strings for logs (keeps first 8 and last 4 chars). */
    fun redact(s: String?): String? {
        if (s == null) return null
        val str = s.trim()
        if (str.length <= 12) return "****"
        return str.take(8) + "…" + str.takeLast(4)
    }
}
