package com.apex.sandbox

import android.os.Bundle
import android.widget.Button
import android.widget.TextView
import androidx.activity.ComponentActivity
import androidx.activity.enableEdgeToEdge
import androidx.appcompat.app.AlertDialog
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        if (!EmulatorGuard.isRunningOnEmulator()) {
            AlertDialog.Builder(this)
                .setTitle("Emulator Only")
                .setMessage("This sandbox app is restricted to Android Emulators. It will now close.")
                .setCancelable(false)
                .setPositiveButton("Exit") { _, _ -> finish() }
                .show()
            return
        }

        enableEdgeToEdge()
        setContentView(R.layout.activity_main)
        ViewCompat.setOnApplyWindowInsetsListener(findViewById(R.id.root)) { v, insets ->
            val systemBars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
            v.setPadding(systemBars.left, systemBars.top, systemBars.right, systemBars.bottom)
            insets
        }

        val status = findViewById<TextView>(R.id.statusText)
        val initBtn = findViewById<Button>(R.id.initBtn)
        val loadInterstitialBtn = findViewById<Button>(R.id.loadInterstitialBtn)
        val showInterstitialBtn = findViewById<Button>(R.id.showInterstitialBtn)
        val loadRewardedBtn = findViewById<Button>(R.id.loadRewardedBtn)
        val showRewardedBtn = findViewById<Button>(R.id.showRewardedBtn)

        status.text = "SDK: not initialized"

        initBtn.setOnClickListener {
            // TODO: Wire to SDK initialize with sandbox_config.json
            status.text = "SDK: initialized (stub)"
        }
        loadInterstitialBtn.setOnClickListener { status.text = "Interstitial: loaded (stub)" }
        showInterstitialBtn.setOnClickListener { status.text = "Interstitial: shown (stub)" }
        loadRewardedBtn.setOnClickListener { status.text = "Rewarded: loaded (stub)" }
        showRewardedBtn.setOnClickListener { status.text = "Rewarded: shown (stub)" }
    }
}
