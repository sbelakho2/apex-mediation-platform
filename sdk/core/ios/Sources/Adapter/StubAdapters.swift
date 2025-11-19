import Foundation

// MARK: - Base stub adapter

public class BaseStubAdapter: AdNetworkAdapter {
    private let _networkName: String
    private let requiredConfigKey: String
    private var isInitialized = false

    public init(networkName: String, requiredConfigKey: String) {
        self._networkName = networkName
        self.requiredConfigKey = requiredConfigKey
    }

    public required convenience init() {
        // This base class should not be constructed via required init directly
        self.init(networkName: "stub", requiredConfigKey: "key")
    }

    public var networkName: String { _networkName }
    public var version: String { "1.0.0" }
    public var minSDKVersion: String { "1.0.0" }

    public func initialize(config: [String : Any]) throws {
        guard let v = config[requiredConfigKey] as? String, !v.isEmpty else {
            throw AdapterError.loadFailed("\(requiredConfigKey) required")
        }
        isInitialized = true
    }

    public func loadAd(placement: String, adType: AdType, config: [String : Any], completion: @escaping (Result<Ad, AdapterError>) -> Void) {
        guard isInitialized else { completion(.failure(.notInitialized)); return }
        guard supportsAdType(adType) else { completion(.failure(.unsupportedAdType)); return }
        // Return a basic mock banner
        let creative: Creative = .banner(
            imageURL: "https://example.invalid/ad.png",
            clickURL: "https://example.invalid/click",
            width: 320,
            height: 50
        )
        let ad = Ad(
            adId: "mock-\(networkName)-\(placement)",
            placement: placement,
            adType: adType,
            creative: creative,
            networkName: networkName,
            cpm: 0.99,
            expiresAt: Date().addingTimeInterval(3600),
            metadata: [:]
        )
        completion(.success(ad))
    }

    public func supportsAdType(_ adType: AdType) -> Bool {
        switch adType { case .banner, .interstitial, .rewarded: return true; default: return false }
    }

    public func destroy() { isInitialized = false }
}

// MARK: - Concrete stub adapters (12)

public final class IronSourceAdapter: BaseStubAdapter { public required init() { super.init(networkName: "ironsource", requiredConfigKey: "app_key") } }
public final class FacebookAdapter: BaseStubAdapter { public required init() { super.init(networkName: "facebook", requiredConfigKey: "placement_id") } }
public final class VungleAdapter: BaseStubAdapter { public required init() { super.init(networkName: "vungle", requiredConfigKey: "app_id") } }
public final class ChartboostAdapter: BaseStubAdapter { public required init() { super.init(networkName: "chartboost", requiredConfigKey: "app_id") } }
public final class PangleAdapter: BaseStubAdapter { public required init() { super.init(networkName: "pangle", requiredConfigKey: "app_id") } }
public final class MintegralAdapter: BaseStubAdapter { public required init() { super.init(networkName: "mintegral", requiredConfigKey: "app_id") } }
public final class AdColonyAdapter: BaseStubAdapter { public required init() { super.init(networkName: "adcolony", requiredConfigKey: "app_id") } }
public final class TapjoyAdapter: BaseStubAdapter { public required init() { super.init(networkName: "tapjoy", requiredConfigKey: "sdk_key") } }
public final class MolocoAdapter: BaseStubAdapter { public required init() { super.init(networkName: "moloco", requiredConfigKey: "seat_id") } }
public final class FyberAdapter: BaseStubAdapter { public required init() { super.init(networkName: "fyber", requiredConfigKey: "app_id") } }
public final class SmaatoAdapter: BaseStubAdapter { public required init() { super.init(networkName: "smaato", requiredConfigKey: "publisher_id") } }
public final class AmazonAdapter: BaseStubAdapter { public required init() { super.init(networkName: "amazon", requiredConfigKey: "app_key") } }
