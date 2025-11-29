package com.apex.sandbox.tv

import android.os.Bundle
import android.widget.TextView
import androidx.activity.ComponentActivity
import androidx.appcompat.app.AlertDialog

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

        val view = TextView(this).apply {
            text = "Apex Sandbox Android TV\n(Leanback stub UI)"
            textSize = 20f
            setPadding(24, 24, 24, 24)
        }
        setContentView(view)
    }
}