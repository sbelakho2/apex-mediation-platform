package com.rivalapexmediation.sdk.measurement

/**
 * Global registry for OM SDK controller used by facade show() paths.
 * Host apps may inject a real implementation via BelAds.setOmSdkController().
 */
object OmSdkRegistry {
    @Volatile
    var controller: OmSdkController = NoOpOmSdkController()

    @JvmStatic
    fun setController(c: OmSdkController) {
        controller = c
    }
}