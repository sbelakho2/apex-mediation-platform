package com.apexmediation.sdk

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ApexMediationTest {
    @Test
    fun initializationFailsWithEmptyKey() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        var failure = false

        ApexMediation.initialize(context, "") { result ->
            failure = result.isFailure
        }

        assertTrue(failure)
    }
}
