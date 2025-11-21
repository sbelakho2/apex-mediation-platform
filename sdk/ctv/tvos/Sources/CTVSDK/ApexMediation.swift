import Foundation
import AVFoundation

// Lightweight telemetry hooks mirror the Android TV metrics recorder.
// MetricsRecorder remains internal and only activates when remote config enables it.

public final class ApexMediation {
    public static let shared = ApexMediation()
    private init() {}

    private var _initialized = false
    private var _config: SDKConfig?
    private var consentMgr: ConsentManager?
    private var auctionClient: AuctionClient?
    private var configManager: ConfigManager?

    @discardableResult
    public func initialize(config: SDKConfig, completion: ((Bool) -> Void)? = nil) -> Bool {
        guard !_initialized else { completion?(true); return true }
        _config = config
        consentMgr = ConsentManager()
        auctionClient = AuctionClient(config: config)
        configManager = ConfigManager(config: config)
        MetricsRecorder.shared.initialize(config: config)
        configManager?.load()
        _initialized = true
        completion?(true)
        return true
    }

    public var isInitialized: Bool { _initialized }
    public func setConsent(_ consent: ConsentData) { consentMgr?.set(consent) }
    internal var consent: ConsentData { consentMgr?.get() ?? ConsentData() }
    internal var cfg: SDKConfig { _config ?? SDKConfig(appId: "", apiBaseUrl: "http://localhost:4000/api/v1", apiKey: nil, testMode: false, requestTimeoutMs: 5000) }
    internal var client: AuctionClient { auctionClient ?? AuctionClient(config: cfg) }
    internal func loadGuard(for placementId: String) -> String? { configManager?.guardLoad(placementId: placementId) }
    internal func showGuard(for placementId: String) -> String? { configManager?.guardShow(placementId: placementId) }
    internal func recordSloSample(success: Bool) { configManager?.recordSloSample(success: success) }
    internal var metricsEnabled: Bool { configManager?.metricsEnabled ?? false }
}
