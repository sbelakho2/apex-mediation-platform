package com.rivalapexmediation.sdk.consent

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class ConsentManagerTest {
    @Test
    fun normalize_trims_and_nulls_empty() {
        val s = ConsentManager.normalize(
            tcf = "  ",
            usp = "\n\t",
            gdprApplies = null,
            coppa = null,
            limitAdTracking = null,
        )
        assertNull(s.consentString)
        assertNull(s.usPrivacy)
        assertNull(s.gdprApplies)
    }

    @Test
    fun normalize_keeps_values_and_flags() {
        val s = ConsentManager.normalize(
            tcf = "TCF_V2",
            usp = "1YNN",
            gdprApplies = true,
            coppa = false,
            limitAdTracking = true,
        )
        assertEquals("TCF_V2", s.consentString)
        assertEquals("1YNN", s.usPrivacy)
        assertEquals(true, s.gdprApplies)
        assertEquals(false, s.coppa)
        assertEquals(true, s.limitAdTracking)
    }

    @Test
    fun redact_masks_long_strings() {
        val red = ConsentManager.redact("ABCDEFGHIJKLmnopqrstuvwxyz")
        // Expect first 8, ellipsis, last 4
        assertEquals("ABCDEFGH…wxyz", red)
    }

    @Test
    fun redact_short_strings_become_stars() {
        val red = ConsentManager.redact("shortstr")
        assertEquals("****", red)
    }
}
