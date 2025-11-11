import Foundation

@MainActor
public final class MediationSDK {
    public static let shared = MediationSDK()

    private let _sdkVersion = "1.0.0"

    private var config: SDKConfig?
    private var remoteConfig: SDKRemoteConfig?
    private var configManager: ConfigManager?
    private var telemetry: TelemetryCollector?
    private var adapterRegistry: AdapterRegistry?
    private var signatureVerifier: SignatureVerifier?
    private var _isInitialized = false

    private init() {}
    
    /// Check if SDK is initialized (public accessor for BelAds)
    public var isInitialized: Bool {
        return _isInitialized
    }

    // MARK: - Debug/Diagnostics accessors (read-only)
    /// Current appId set during initialize(), if any.
    public func currentAppId() -> String? {
        return config?.appId
    }
    /// Current placement identifiers from the last loaded remote config.
    public func currentPlacementIds() -> [String] {
        if let cfg = remoteConfig {
            return cfg.placements.map { $0.placementId }
        }
        return []
    }
    
    // MARK: - Section 3.1 Debug Panel Support
    /// SDK version for debug panel display
    public var sdkVersion: String {
        return _sdkVersion
    }
    
    /// Test mode indicator for debug panel
    public var isTestMode: Bool {
        return config?.testMode ?? false
    }
    
    /// Remote config version for debug panel
    public var remoteConfigVersion: Int? {
        return remoteConfig?.version
    }
    
    /// Registered adapter count for debug panel
    public var registeredAdapterCount: Int {
        return adapterRegistry?.registeredCount ?? 0
    }

    /// Initialize the mediation SDK.
    /// - Parameters:
    ///   - appId: Application identifier provisioned in the Rival Apex console.
    ///   - configuration: Optional configuration to override defaults. When omitted, production endpoints are used.
    public func initialize(appId: String, configuration: SDKConfig? = nil) async throws {
        guard !isInitialized else {
            throw SDKError.alreadyInitialized
        }

        let providedConfig = configuration ?? SDKConfig.default(appId: appId)
        let resolvedConfig = providedConfig.withAppId(appId)

        // Configure signature verifier with safe gating for test-mode bypass
        if resolvedConfig.configSignaturePublicKey != nil || resolvedConfig.testMode {
            let enableTestMode: Bool = {
                if resolvedConfig.testMode == false { return false }
                #if DEBUG
                return true
                #else
                // Allow test-mode bypass only if the host app bundle is allowlisted in Info.plist
                let bundleId = Bundle.main.bundleIdentifier ?? ""
                if let list = Bundle.main.object(forInfoDictionaryKey: "ApexMediationDebugAllowlist") as? [String] {
                    return list.contains(bundleId)
                }
                return false
                #endif
            }()
            signatureVerifier = SignatureVerifier(
                testMode: enableTestMode,
                productionPublicKey: resolvedConfig.configSignaturePublicKey
            )
        } else {
            signatureVerifier = nil
        }

        let manager = ConfigManager(config: resolvedConfig, signatureVerifier: signatureVerifier)
        let remote = try await manager.loadConfig()

        let registry = AdapterRegistry(sdkVersion: _sdkVersion)
        configureAdapters(registry: registry, with: remote)

        let telemetryCollector = TelemetryCollector(config: resolvedConfig)
        telemetryCollector.start()
        telemetryCollector.recordInitialization()

        config = resolvedConfig
        remoteConfig = remote
        configManager = manager
        telemetry = telemetryCollector
        adapterRegistry = registry
        _isInitialized = true
    }

    /// Load an ad for the supplied placement.
    /// - Parameter placementId: Placement identifier configured in the console.
    /// - Returns: Loaded ad or `nil` when no adapter returned fill.
    public func loadAd(placementId: String) async throws -> Ad? {
        guard _isInitialized else {
            throw SDKError.notInitialized
        }

        let config = try await ensureRemoteConfig()
        guard let placement = config.placements.first(where: { $0.placementId == placementId }) else {
            throw SDKError.invalidPlacement(placementId)
        }

        guard let registry = adapterRegistry else {
            throw SDKError.internalError(message: "Adapter registry not initialized")
        }

        let adaptersInPriority = placement.adapterPriority
        guard !adaptersInPriority.isEmpty else {
            return nil
        }

        for networkName in adaptersInPriority {
            guard let adapterConfig = config.adapters[networkName], adapterConfig.enabled else {
                continue
            }

            guard let adapter = registry.getAdapter(networkName: networkName) else {
                continue
            }

            if !adapter.supportsAdType(placement.adType) {
                continue
            }

            ensureAdapterInitialized(networkName: networkName, adapterConfig: adapterConfig)

            let settings = adapterConfig.settings.mapValues { $0.value }
            let start = Date()

            do {
                let ad = try await loadAd(from: adapter, placement: placementId, adType: placement.adType, settings: settings)
                let latency = Int(Date().timeIntervalSince(start) * 1_000)
                telemetry?.recordAdLoad(
                    placement: placementId,
                    adType: placement.adType,
                    networkName: networkName,
                    latency: latency,
                    success: true
                )
                return ad
            } catch AdapterError.timeout {
                telemetry?.recordTimeout(placement: placementId, adType: placement.adType, reason: "adapter_timeout")
            } catch {
                let latency = Int(Date().timeIntervalSince(start) * 1_000)
                telemetry?.recordAdLoad(
                    placement: placementId,
                    adType: placement.adType,
                    networkName: networkName,
                    latency: latency,
                    success: false
                )
                telemetry?.recordError(errorCode: "adapter_failure", error: error)
            }
        }

        telemetry?.recordAdLoad(
            placement: placementId,
            adType: placement.adType,
            networkName: "none",
            latency: 0,
            success: false
        )
        return nil
    }

    /// Check if an ad is cached and ready. Placeholder implementation; caching is pending.
    public func isAdReady(placementId: String) -> Bool {
        // TODO: Implement ad caching in a follow-up pass.
        return false
    }

    /// Shutdown the SDK and release resources.
    public func shutdown() {
        guard _isInitialized else { return }

        telemetry?.stop()
        adapterRegistry?.destroy()
        configManager?.shutdown()

        telemetry = nil
        adapterRegistry = nil
        configManager = nil
        remoteConfig = nil
        config = nil
        signatureVerifier = nil
        _isInitialized = false
    }

    private func ensureRemoteConfig() async throws -> SDKRemoteConfig {
        if let cached = remoteConfig {
            return cached
        }
        guard let manager = configManager else {
            throw SDKError.internalError(message: "Config manager not initialized")
        }
        let refreshed = try await manager.loadConfig()
        remoteConfig = refreshed
        if let registry = adapterRegistry {
            configureAdapters(registry: registry, with: refreshed)
        }
        return refreshed
    }

    private func configureAdapters(registry: AdapterRegistry, with config: SDKRemoteConfig) {
        for (networkName, adapterConfig) in config.adapters where adapterConfig.enabled {
            let settings = adapterConfig.settings.mapValues { $0.value }
            registry.initializeAdapter(networkName: networkName, config: settings)
        }
    }

    private func ensureAdapterInitialized(networkName: String, adapterConfig: AdapterConfig) {
        guard let registry = adapterRegistry else { return }
        if !registry.isInitialized(networkName: networkName) {
            let settings = adapterConfig.settings.mapValues { $0.value }
            registry.initializeAdapter(networkName: networkName, config: settings)
        }
    }

    private func loadAd(
        from adapter: AdNetworkAdapter,
        placement: String,
        adType: AdType,
        settings: [String: Any]
    ) async throws -> Ad {
        try await withCheckedThrowingContinuation { continuation in
            adapter.loadAd(placement: placement, adType: adType, config: settings) { result in
                continuation.resume(with: result)
            }
        }
    }
}

// MARK: - Section 3.3 Enhanced Error Taxonomy

public enum SDKError: Error, LocalizedError, Equatable {
    case notInitialized
    case alreadyInitialized
    case invalidPlacement(String)
    case noFill
    case timeout
    case networkError(underlying: String?)
    case internalError(message: String?)
    
    // Section 3.3: HTTP status code errors for parity with Android
    case status_429(message: String)
    case status_5xx(code: Int, message: String)

    public var errorDescription: String? {
        switch self {
        case .notInitialized:
            return "SDK not initialized. Call initialize() first."
        case .alreadyInitialized:
            return "SDK already initialized."
        case .invalidPlacement(let placement):
            return "Invalid placement: \(placement)"
        case .noFill:
            return "No ad available."
        case .timeout:
            return "Request timed out."
        case .networkError(let underlying):
            if let msg = underlying {
                return "Network error: \(msg)"
            }
            return "Network error occurred."
        case .internalError(let message):
            if let msg = message {
                return "Internal error: \(msg)"
            }
            return "Internal error occurred."
        case .status_429(let message):
            return "Rate limit exceeded (429): \(message)"
        case .status_5xx(let code, let message):
            return "Server error (\(code)): \(message)"
        }
    }
    
    /// Map HTTP status codes to SDK errors (Section 3.3)
    public static func fromHTTPStatus(code: Int, message: String? = nil) -> SDKError {
        switch code {
        case 429:
            return .status_429(message: message ?? "Too many requests")
        case 500...599:
            return .status_5xx(code: code, message: message ?? "Server error")
        case 204:
            return .noFill
        default:
            return .networkError(underlying: message ?? "HTTP \(code)")
        }
    }
    
    // Equatable conformance for testing
    public static func == (lhs: SDKError, rhs: SDKError) -> Bool {
        switch (lhs, rhs) {
        case (.notInitialized, .notInitialized),
             (.alreadyInitialized, .alreadyInitialized),
             (.noFill, .noFill),
             (.timeout, .timeout):
            return true
        case (.invalidPlacement(let lp), .invalidPlacement(let rp)):
            return lp == rp
        case (.networkError(let lu), .networkError(let ru)):
            return lu == ru
        case (.internalError(let lm), .internalError(let rm)):
            return lm == rm
        case (.status_429(let lm), .status_429(let rm)):
            return lm == rm
        case (.status_5xx(let lc, let lm), .status_5xx(let rc, let rm)):
            return lc == rc && lm == rm
        default:
            return false
        }
    }
}
