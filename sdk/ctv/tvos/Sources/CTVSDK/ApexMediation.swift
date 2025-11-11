import Foundation
import AVFoundation

public final class ApexMediation {
    public static let shared = ApexMediation()
    private init() {}

    private var _initialized = false
    private var _config: SDKConfig?
    private var consentMgr: ConsentManager?
    private var auctionClient: AuctionClient?

    @discardableResult
    public func initialize(config: SDKConfig, completion: ((Bool) -> Void)? = nil) -> Bool {
        guard !_initialized else { completion?(true); return true }
        _config = config
        consentMgr = ConsentManager()
        auctionClient = AuctionClient(config: config)
        _initialized = true
        completion?(true)
        return true
    }

    public var isInitialized: Bool { _initialized }
    public func setConsent(_ consent: ConsentData) { consentMgr?.set(consent) }
    internal var consent: ConsentData { consentMgr?.get() ?? ConsentData() }
    internal var cfg: SDKConfig { _config ?? SDKConfig(appId: "", apiBaseUrl: "http://localhost:4000/api/v1", apiKey: nil, testMode: false, requestTimeoutMs: 5000) }
    internal var client: AuctionClient { auctionClient ?? AuctionClient(config: cfg) }
}
