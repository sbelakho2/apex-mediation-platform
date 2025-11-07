import Foundation

@MainActor
public final class MediationSDK {
    public static let shared = MediationSDK()

    private let sdkVersion = "1.0.0"

    private var config: SDKConfig?
    private var remoteConfig: SDKRemoteConfig?
    private var configManager: ConfigManager?
    private var telemetry: TelemetryCollector?
    private var adapterRegistry: AdapterRegistry?
    private var signatureVerifier: SignatureVerifier?
    private var isInitialized = false

    private init() {}

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

        if resolvedConfig.configSignaturePublicKey != nil || resolvedConfig.testMode {
            signatureVerifier = SignatureVerifier(
                testMode: resolvedConfig.testMode,
                productionPublicKey: resolvedConfig.configSignaturePublicKey
            )
        } else {
            signatureVerifier = nil
        }

        let manager = ConfigManager(config: resolvedConfig, signatureVerifier: signatureVerifier)
        let remote = try await manager.loadConfig()

        let registry = AdapterRegistry(sdkVersion: sdkVersion)
        configureAdapters(registry: registry, with: remote)

        let telemetryCollector = TelemetryCollector(config: resolvedConfig)
        telemetryCollector.start()
        telemetryCollector.recordInitialization()

        config = resolvedConfig
        remoteConfig = remote
        configManager = manager
        telemetry = telemetryCollector
        adapterRegistry = registry
        isInitialized = true
    }

    /// Load an ad for the supplied placement.
    /// - Parameter placementId: Placement identifier configured in the console.
    /// - Returns: Loaded ad or `nil` when no adapter returned fill.
    public func loadAd(placementId: String) async throws -> Ad? {
        guard isInitialized else {
            throw SDKError.notInitialized
        }

        let config = try await ensureRemoteConfig()
        guard let placement = config.placements.first(where: { $0.placementId == placementId }) else {
            throw SDKError.invalidPlacement(placementId)
        }

        guard let registry = adapterRegistry else {
            throw SDKError.internalError
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
        guard isInitialized else { return }

        telemetry?.stop()
        adapterRegistry?.destroy()
        configManager?.shutdown()

        telemetry = nil
        adapterRegistry = nil
        configManager = nil
        remoteConfig = nil
        config = nil
        signatureVerifier = nil
        isInitialized = false
    }

    private func ensureRemoteConfig() async throws -> SDKRemoteConfig {
        if let cached = remoteConfig {
            return cached
        }
        guard let manager = configManager else {
            throw SDKError.internalError
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

public enum SDKError: Error, LocalizedError {
    case notInitialized
    case alreadyInitialized
    case invalidPlacement(String)
    case noFill
    case timeout
    case networkError
    case internalError

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
        case .networkError:
            return "Network error occurred."
        case .internalError:
            return "Internal error occurred."
        }
    }
}
