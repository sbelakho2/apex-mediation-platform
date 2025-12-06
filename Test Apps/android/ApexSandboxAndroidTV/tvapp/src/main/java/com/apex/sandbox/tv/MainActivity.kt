package com.apex.sandbox.tv

import android.os.Bundle
import android.widget.TextView
import androidx.activity.ComponentActivity
import androidx.appcompat.app.AlertDialog
import android.util.Log

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        if (!TvEmulatorGuard.isRunningOnEmulator()) {
            AlertDialog.Builder(this)
                .setTitle("Emulator Only")
                .setMessage("This TV sandbox app is restricted to Android TV Emulators. The app will now exit.")
                .setCancelable(false)
                .setPositiveButton("Exit") { _, _ -> finish() }
                .show()
            return
        }

        val cfg = TvSandboxConfigLoader.load(this)
        Log.i("ApexSandboxTV", "Loaded config: appId=${cfg.appId}, forceAdapterPipeline=${cfg.forceAdapterPipeline}, whitelist=${cfg.adapterWhitelist}")

        // Note: This TV stub does not yet wire the real core SDK. If you add the core SDK,
        // apply sandbox flags after initialize:
        // sdk.setSandboxForceAdapterPipeline(cfg.forceAdapterPipeline == true)
        // if (!cfg.adapterWhitelist.isNullOrEmpty()) sdk.setSandboxAdapterWhitelist(cfg.adapterWhitelist)

        val view = TextView(this).apply {
            text = "Apex Sandbox Android TV\n(Leanback stub UI)\nappId=${cfg.appId}\nwhitelist=${cfg.adapterWhitelist ?: listOf<String>()}"
            textSize = 20f
            setPadding(24, 24, 24, 24)
        }
        setContentView(view)
    }
}