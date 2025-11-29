package com.apex.sandbox.ui

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.apex.sandbox.data.ConfigRepository
import com.apex.sandbox.model.ConsentState
import com.apex.sandbox.model.SandboxConfig
import com.apex.sandbox.sdk.AdResult
import com.apex.sandbox.sdk.FakeMediationSdk
import com.apex.sandbox.sdk.FakeNetwork
import com.apex.sandbox.sdk.InitOptions
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class SandboxViewModel(app: Application) : AndroidViewModel(app) {
    private val repo = ConfigRepository(app)
    private val sdk = FakeMediationSdk(viewModelScope)

    private val _config = MutableStateFlow<SandboxConfig?>(null)
    val config: StateFlow<SandboxConfig?> = _config.asStateFlow()

    private val _status = MutableStateFlow("SDK: not initialized")
    val status: StateFlow<String> = _status.asStateFlow()

    private val _log = MutableStateFlow<List<String>>(emptyList())
    val log: StateFlow<List<String>> = _log.asStateFlow()

    // Toggles
    private val _consent = MutableStateFlow(ConsentState())
    val consent: StateFlow<ConsentState> = _consent.asStateFlow()

    private val _network = MutableStateFlow(FakeNetwork.A_ALWAYS_FILL)
    val network: StateFlow<FakeNetwork> = _network.asStateFlow()

    private val _airplane = MutableStateFlow(false)
    val airplane: StateFlow<Boolean> = _airplane.asStateFlow()

    private val _invalidPlacement = MutableStateFlow(false)
    val invalidPlacement: StateFlow<Boolean> = _invalidPlacement.asStateFlow()

    init {
        viewModelScope.launch {
            val cfg = repo.loadConfig()
            val loadedConsent = repo.loadConsentDefaults(cfg.consent)
            _config.value = cfg.copy(consent = loadedConsent)
            _consent.value = loadedConsent
            appendLog("Config loaded: apiBase=${cfg.apiBase}")
        }
    }

    fun setNetwork(nw: FakeNetwork) { _network.value = nw }
    fun setAirplane(on: Boolean) { _airplane.value = on }
    fun setInvalidPlacement(on: Boolean) { _invalidPlacement.value = on }
    fun setConsent(update: ConsentState) {
        _consent.value = update
        repo.saveConsent(update)
        appendLog("Consent updated: gdpr=${update.gdpr}, ccpa=${update.ccpa}, coppa=${update.coppa}, lat=${update.lat}, test=${update.testMode}")
    }

    fun initialize() {
        val cfg = _config.value ?: return
        val c = _consent.value
        viewModelScope.launch {
            _status.value = "Initializing..."
            appendLog("Initialize requested")
            val res = sdk.initialize(
                InitOptions(
                    apiBase = cfg.apiBase,
                    gdpr = c.gdpr,
                    ccpa = c.ccpa,
                    coppa = c.coppa,
                    lat = c.lat,
                    testMode = c.testMode,
                )
            )
            _status.value = if (res.isSuccess) "SDK: initialized" else "SDK: init failed"
            appendLog("Initialize result: ${res.fold({ it }, { it.message ?: "error" })}")
        }
    }

    fun loadInterstitial(placementId: String) {
        viewModelScope.launch {
            appendLog("Load interstitial: $placementId via ${_network.value}")
            when (val r = sdk.loadInterstitial(placementId, _network.value, _airplane.value, _invalidPlacement.value)) {
                is AdResult.Loaded -> {
                    _status.value = "Interstitial loaded: ${r.placementId}"
                    appendLog("Loaded: ${r.placementId}")
                }
                is AdResult.Error -> {
                    _status.value = "Error(${r.code}): ${r.message}"
                    appendLog("Error ${r.code}: ${r.message}")
                }
                else -> {}
            }
        }
    }

    fun showInterstitial(placementId: String) {
        viewModelScope.launch {
            appendLog("Show interstitial: $placementId")
            when (val r = sdk.showInterstitial(placementId)) {
                is AdResult.Shown -> {
                    _status.value = "Interstitial shown: ${r.placementId}"
                    appendLog("Shown: ${r.placementId}")
                }
                is AdResult.Error -> {
                    _status.value = "Error(${r.code}): ${r.message}"
                    appendLog("Error ${r.code}: ${r.message}")
                }
                else -> {}
            }
        }
    }

    fun loadRewarded(placementId: String) {
        viewModelScope.launch {
            appendLog("Load rewarded: $placementId via ${_network.value}")
            when (val r = sdk.loadRewarded(placementId, _network.value, _airplane.value, _invalidPlacement.value)) {
                is AdResult.Loaded -> {
                    _status.value = "Rewarded loaded: ${r.placementId}"
                    appendLog("Loaded: ${r.placementId}")
                }
                is AdResult.Error -> {
                    _status.value = "Error(${r.code}): ${r.message}"
                    appendLog("Error ${r.code}: ${r.message}")
                }
                else -> {}
            }
        }
    }

    fun showRewarded(placementId: String) {
        viewModelScope.launch {
            appendLog("Show rewarded: $placementId")
            when (val r = sdk.showRewarded(placementId)) {
                is AdResult.Shown -> {
                    _status.value = "Rewarded shown: ${r.placementId}"
                    appendLog("Shown: ${r.placementId}")
                }
                is AdResult.Error -> {
                    _status.value = "Error(${r.code}): ${r.message}"
                    appendLog("Error ${r.code}: ${r.message}")
                }
                else -> {}
            }
        }
    }

    fun clearLog() { _log.value = emptyList() }

    private fun appendLog(line: String) {
        val ts = SimpleDateFormat("HH:mm:ss.SSS", Locale.US).format(Date())
        val entry = "[$ts] $line"
        val current = _log.value
        val next = (current + entry).takeLast(200)
        _log.value = next
    }
}
