import Foundation
import Dispatch

public final class MediationSDK {
    public static let shared = MediationSDK()

    private let sdkVersionValue = "1.0.0"
    private let runtime: MediationRuntime
    private let snapshotLock = NSLock()
    private var snapshot: SDKSnapshot = .empty

    private init() {
        runtime = MediationRuntime(sdkVersion: sdkVersionValue)
    }
    
    // MARK: - Debug/Diagnostics accessors (read-only)
    public var isInitialized: Bool {
        readSnapshot { $0.isInitialized }
    }

    public func currentAppId() -> String? {
        readSnapshot { $0.appId }
    }

    public func currentPlacementIds() -> [String] {
        readSnapshot { $0.placementIds }
    }
    
    public var sdkVersion: String {
        sdkVersionValue
    }
    
    public var isTestMode: Bool {
        readSnapshot { $0.testMode }
    }
    
    public var remoteConfigVersion: Int? {
        readSnapshot { $0.remoteConfigVersion }
    }
    
    public var registeredAdapterCount: Int {
        readSnapshot { $0.registeredAdapters }
    }

    /// Initialize the mediation SDK.
    public func initialize(appId: String, configuration: SDKConfig? = nil) async throws {
        let digest = try await runtime.initialize(appId: appId, configuration: configuration)
        updateSnapshot(digest)
    }

    /// Load an ad for the supplied placement.
    public func loadAd(placementId: String) async throws -> Ad? {
        let ad = try await runtime.loadAd(placementId: placementId)
        await refreshSnapshot()
        return ad
    }

    /// Check if an ad is cached and ready. Placeholder implementation; caching is pending.
    public func isAdReady(placementId: String) -> Bool {
        false
    }

    /// Shutdown the SDK and release resources.
    public func shutdown() {
        let semaphore = DispatchSemaphore(value: 0)
        Task {
            let digest = await runtime.shutdown()
            updateSnapshot(digest)
            semaphore.signal()
        }
        semaphore.wait()
    }

    private func refreshSnapshot() async {
        let digest = await runtime.snapshot()
        updateSnapshot(digest)
    }

    private func updateSnapshot(_ newSnapshot: SDKSnapshot) {
        snapshotLock.lock()
        snapshot = newSnapshot
        snapshotLock.unlock()
    }

    private func readSnapshot<T>(_ transform: (SDKSnapshot) -> T) -> T {
        snapshotLock.lock()
        let value = transform(snapshot)
        snapshotLock.unlock()
        return value
    }
}

// MARK: - Private Runtime Types

private struct SDKSnapshot {
    let appId: String?
    let placementIds: [String]
    let remoteConfigVersion: Int?
    let registeredAdapters: Int
    let testMode: Bool
    let isInitialized: Bool

    static let empty = SDKSnapshot(appId: nil, placementIds: [], remoteConfigVersion: nil, registeredAdapters: 0, testMode: false, isInitialized: false)
}

private actor MediationRuntime {
    private let sdkVersion: String

    private var config: SDKConfig?
    private var remoteConfig: SDKRemoteConfig?
    private var configManager: ConfigManager?
    private var telemetry: TelemetryCollector?
    private var adapterRegistry: AdapterRegistry?
    private var signatureVerifier: SignatureVerifier?
    private var initialized = false

    init(sdkVersion: String) {
        self.sdkVersion = sdkVersion
    }

    func initialize(appId: String, configuration: SDKConfig?) async throws -> SDKSnapshot {
        guard !initialized else {
            throw SDKError.alreadyInitialized
        }

        let providedConfig = configuration ?? SDKConfig.default(appId: appId)
        let resolvedConfig = providedConfig.withAppId(appId)

        if resolvedConfig.configSignaturePublicKey != nil || resolvedConfig.testMode {
            signatureVerifier = SignatureVerifier(
                testMode: Self.shouldEnableTestBypass(for: resolvedConfig),
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
        initialized = true

        return snapshot()
    }

    func loadAd(placementId: String) async throws -> Ad? {
        guard initialized else {
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

        assert(!Thread.isMainThread, "MediationRuntime.loadAd should not execute on the main thread")

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
            } catch let adapterError as AdapterError where adapterError.code == .timeout {
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

    func shutdown() -> SDKSnapshot {
        guard initialized else {
            return snapshot()
        }

        telemetry?.stop()
        adapterRegistry?.destroy()
        configManager?.shutdown()

        telemetry = nil
        adapterRegistry = nil
        configManager = nil
        remoteConfig = nil
        config = nil
        signatureVerifier = nil
        initialized = false
        return snapshot()
    }

    func snapshot() -> SDKSnapshot {
        SDKSnapshot(
            appId: config?.appId,
            placementIds: remoteConfig?.placements.map { $0.placementId } ?? [],
            remoteConfigVersion: remoteConfig?.version,
            registeredAdapters: adapterRegistry?.registeredCount ?? 0,
            testMode: config?.testMode ?? false,
            isInitialized: initialized
        )
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

    private static func shouldEnableTestBypass(for config: SDKConfig) -> Bool {
        guard config.testMode else { return false }
        #if DEBUG
        return true
        #else
        let bundleId = Bundle.main.bundleIdentifier ?? ""
        if let list = Bundle.main.object(forInfoDictionaryKey: "ApexMediationDebugAllowlist") as? [String] {
            return list.contains(bundleId)
        }
        return false
        #endif
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
