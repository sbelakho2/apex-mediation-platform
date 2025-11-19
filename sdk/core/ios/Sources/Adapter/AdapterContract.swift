import Foundation

// MARK: - Data Contracts

public struct AdapterCredentials: Codable, Equatable {
    public let key: String
    public let secret: String?
    public let appId: String?
    public let accountIds: [String: String]?
}

public struct AdapterOptions: Codable, Equatable {
    public let startMuted: Bool?
    public let testMode: Bool?
    public let bidFloorMicros: Int64?
}

public enum PartnerRegion: String, Codable {
    case us, eu, apac, cn, global
}

public struct ConsentState: Codable, Equatable {
    public let iabTCFv2: String?
    public let iabUSGPP: String?
    public let coppa: Bool
    public let attStatus: ATTStatus
    public let limitAdTracking: Bool
}

public enum ATTStatus: String, Codable {
    case authorized, denied, notDetermined, restricted
}

public struct AdapterConfig: Codable, Equatable {
    public let partner: String
    public let credentials: AdapterCredentials
    public let placements: [String: String]
    public let privacy: ConsentState
    public let region: PartnerRegion?
    public let options: AdapterOptions?
}

public struct DeviceMeta: Codable, Equatable {
    public let os: String
    public let osVersion: String
    public let model: String
}

public struct UserMeta: Codable, Equatable {
    public let ageRestricted: Bool
    public let consent: ConsentState
}

public struct NetworkMeta: Codable, Equatable {
    public let ipPrefixed: String
    public let uaNormalized: String
    public let connType: ConnectionType
}

public enum ConnectionType: String, Codable {
    case wifi, cell, other
}

public struct ContextMeta: Codable, Equatable {
    public let orientation: Orientation
    public let sessionDepth: Int
}

public enum Orientation: String, Codable {
    case portrait, landscape
}

public struct AuctionMeta: Codable, Equatable {
    public let floorsMicros: Int64?
    public let sChain: String?
    public let sellersJsonOk: Bool?
}

public struct RequestMeta: Codable, Equatable {
    public let requestId: String
    public let device: DeviceMeta
    public let user: UserMeta
    public let net: NetworkMeta
    public let context: ContextMeta
    public let auction: AuctionMeta
}

public struct AdHandle: Codable, Equatable {
    public let id: String
    public let adType: AdType
    public let partnerPlacementId: String?
    public let createdAtMs: Int64
    
    public init(id: String, adType: AdType, partnerPlacementId: String?, createdAtMs: Int64 = Int64(Date().timeIntervalSince1970 * 1000)) {
        self.id = id
        self.adType = adType
        self.partnerPlacementId = partnerPlacementId
        self.createdAtMs = createdAtMs
    }
}

public struct LoadResult: Codable, Equatable {
    public let handle: AdHandle
    public let ttlMs: Int
    public let priceMicros: Int64?
    public let currency: String?
    public let partnerMeta: [String: AnyCodable]
}

public struct InitResult: Codable, Equatable {
    public let success: Bool
    public let error: AdapterError?
    public let partnerMeta: [String: AnyCodable]
}

public struct PaidEvent: Codable, Equatable {
    public let valueMicros: Int64
    public let currency: String
    public let precision: PaidEventPrecision
    public let partner: String
    public let partnerUnitId: String?
    public let lineItemId: String?
    public let creativeId: String?
}

public enum PaidEventPrecision: String, Codable { case publisher, estimated }

// MARK: - Error Taxonomy

public enum AdapterErrorCode: String, Codable {
    case noFill, timeout, networkError, belowFloor, error, circuitOpen, config, noAdReady
}

public struct AdapterError: Error, Codable, Equatable {
    public let code: AdapterErrorCode
    public let detail: String
    public let vendorCode: String?
    public let recoverable: Bool
}

// MARK: - Callbacks

public enum CloseReason: String, Codable { case completed, skipped, dismissed }

public protocol ShowCallbacks: AnyObject {
    func onImpression(meta: [String: Any]?)
    func onPaidEvent(_ event: PaidEvent)
    func onClick(meta: [String: Any]?)
    func onClosed(reason: CloseReason)
    func onError(_ error: AdapterError)
}

public protocol RewardedCallbacks: ShowCallbacks {
    func onRewardVerified(rewardType: String, rewardAmount: Double)
}

public protocol BannerCallbacks: ShowCallbacks {
    func onViewAttached()
    func onViewDetached(reason: CloseReason)
}

public struct AdSize: Codable, Equatable {
    public let width: Int
    public let height: Int
    public static let banner320x50 = AdSize(width: 320, height: 50)
}

// MARK: - Core Adapter Protocol

public protocol AdNetworkAdapterV2 {
    func initAdapter(config: AdapterConfig, timeoutMs: Int) -> InitResult
    func loadInterstitial(placementId: String, meta: RequestMeta, timeoutMs: Int) -> LoadResult
    func showInterstitial(handle: AdHandle, viewController: AnyObject, callbacks: ShowCallbacks)
    func loadRewarded(placementId: String, meta: RequestMeta, timeoutMs: Int) -> LoadResult
    func showRewarded(handle: AdHandle, viewController: AnyObject, callbacks: RewardedCallbacks)
    func loadBanner(placementId: String, size: AdSize, meta: RequestMeta, timeoutMs: Int) -> LoadResult
    func attachBanner(handle: AdHandle, hostView: AnyObject, callbacks: BannerCallbacks)
    func isAdReady(handle: AdHandle) -> Bool
    func expiresAt(handle: AdHandle) -> Int64
    func invalidate(handle: AdHandle)
}

// MARK: - AnyCodable helper

public struct AnyCodable: Codable, Equatable {
    public let value: Any
    
    public init(_ value: Any) { self.value = value }
    
    public init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if let intValue = try? container.decode(Int.self) {
            value = intValue
        } else if let doubleValue = try? container.decode(Double.self) {
            value = doubleValue
        } else if let boolValue = try? container.decode(Bool.self) {
            value = boolValue
        } else if let stringValue = try? container.decode(String.self) {
            value = stringValue
        } else if let arrayValue = try? container.decode([AnyCodable].self) {
            value = arrayValue.map { $0.value }
        } else if let dictValue = try? container.decode([String: AnyCodable].self) {
            value = dictValue.mapValues { $0.value }
        } else {
            throw DecodingError.dataCorruptedError(in: container, debugDescription: "Unsupported type")
        }
    }
    
    public func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch value {
        case let intValue as Int: try container.encode(intValue)
        case let doubleValue as Double: try container.encode(doubleValue)
        case let boolValue as Bool: try container.encode(boolValue)
        case let stringValue as String: try container.encode(stringValue)
        case let arrayValue as [Any]: try container.encode(arrayValue.map { AnyCodable($0) })
        case let dictValue as [String: Any]: try container.encode(dictValue.mapValues { AnyCodable($0) })
        default:
            let context = EncodingError.Context(codingPath: container.codingPath, debugDescription: "Unsupported type")
            throw EncodingError.invalidValue(value, context)
        }
    }
}
