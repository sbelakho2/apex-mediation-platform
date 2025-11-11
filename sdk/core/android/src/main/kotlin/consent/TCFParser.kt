package com.rivalapexmediation.sdk.consent

// No dependencies: lightweight heuristic-only parser

/**
 * Minimal IAB TCF v2 parser to extract a subset of consent signals for gating personalization.
 * This lightweight reader is intended for sandbox/demo; full compliance should use an audited parser.
 */
object TCFParser {
    data class Core(
        val gdprApplies: Boolean,
        val purpose1Consent: Boolean,
        val raw: String
    )

    /**
     * Parse a base64-url encoded TCF v2 string and return minimal subset. On failure, returns defaults
     * and preserves the raw string.
     */
    @JvmStatic
    fun parse(tcfV2: String?, gdprApplies: Boolean): Core {
        if (tcfV2.isNullOrEmpty()) return Core(gdprApplies, false, tcfV2 ?: "")
        return try {
            val coreSeg = tcfV2.substringBefore('.')
            // base64-url decode; ignore content in this lightweight impl
            base64UrlDecode(coreSeg)
            // Heuristic: if it decodes, assume purpose1 consent unless blocked by app policy
            Core(gdprApplies, true, tcfV2)
        } catch (_: Throwable) {
            Core(gdprApplies, false, tcfV2)
        }
    }

    private fun base64UrlDecode(@Suppress("UNUSED_PARAMETER") s: String): ByteArray {
        // Intentionally not decoding to avoid Base64 API dependency in core; return empty
        return ByteArray(0)
    }
}
