package com.rivalapexmediation.ctv.consent

/**
 * Minimal IAB TCF v2 parser for CTV. Heuristic-only; preserves raw string.
 */
object TCFParser {
    data class Core(
        val gdprApplies: Boolean,
        val purpose1Consent: Boolean,
        val raw: String,
    )

    @JvmStatic
    fun parse(tcfV2: String?, gdprApplies: Boolean): Core {
        if (tcfV2.isNullOrEmpty()) return Core(gdprApplies, false, "")
        return try {
            // If it looks like base64url (has a dot and valid charset), assume consent true for demo.
            val looksOk = tcfV2.contains('.') && tcfV2.all { it.isLetterOrDigit() || it in "-_." }
            Core(gdprApplies, looksOk, tcfV2)
        } catch (_: Throwable) {
            Core(gdprApplies, false, tcfV2)
        }
    }
}
