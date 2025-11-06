import Foundation
import UIKit

public struct InitializationOptions {
    public let apiKey: String
    public let publisherId: String
    public let auctionUrl: URL?
    public let defaultTimeoutMs: Int
    public init(apiKey: String, publisherId: String, auctionUrl: URL? = nil, defaultTimeoutMs: Int = 800) {
        self.apiKey = apiKey
        self.publisherId = publisherId
        self.auctionUrl = auctionUrl
        self.defaultTimeoutMs = max(100, defaultTimeoutMs)
    }
}

public struct Consent: Codable {
    public var gdprApplies: Bool?
    public var consentString: String?
    public var ccpaUspString: String?
    public var coppa: Bool?
    public var limitAdTracking: Bool?
    public init(gdprApplies: Bool? = nil, consentString: String? = nil, ccpaUspString: String? = nil, coppa: Bool? = nil, limitAdTracking: Bool? = nil) {
        self.gdprApplies = gdprApplies
        self.consentString = consentString
        self.ccpaUspString = ccpaUspString
        self.coppa = coppa
        self.limitAdTracking = limitAdTracking
    }
}

public struct InterstitialOptions {
    public let placementId: String
    public let floorCpm: Double?
    public let adapters: [String]?
    public let metadata: [String:String]?
    public let timeoutMs: Int?
    public init(placementId: String, floorCpm: Double? = nil, adapters: [String]? = nil, metadata: [String:String]? = nil, timeoutMs: Int? = nil) {
        self.placementId = placementId
        self.floorCpm = floorCpm
        self.adapters = adapters
        self.metadata = metadata
        self.timeoutMs = timeoutMs
    }
}

public struct InterstitialResult: Codable, Equatable {
    public let adapter: String
    public let ecpm: Double
    public let currency: String
    public let creativeId: String?
    public let adMarkup: String?
}

public enum ApexMediationError: Error, Equatable, CustomStringConvertible {
    case notInitialized
    case invalidPlacement
    case timeout
    case status(code: Int)
    case noFill
    case other(reason: String)
    public var description: String {
        switch self {
        case .notInitialized: return "not_initialized"
        case .invalidPlacement: return "invalid_placement"
        case .timeout: return "timeout"
        case .status(let c): return "status_\(c)"
        case .noFill: return "no_fill"
        case .other(let r): return r
        }
    }
}

public final class ApexMediation {
    public static let shared = ApexMediation()
    // Test hook: session configuration provider (overridden in unit tests)
    public static var sessionConfigProvider: () -> URLSessionConfiguration = {
        URLSessionConfiguration.ephemeral
    }
    private var initialized = false
    private var options: InitializationOptions?
    private var consent: Consent = Consent()
    private init() {}

    public func initialize(_ options: InitializationOptions) {
        self.options = options
        self.initialized = true
    }

    public func setConsent(_ consent: Consent) {
        self.consent = consent
    }

    public func requestInterstitial(_ opts: InterstitialOptions, completion: @escaping (Result<InterstitialResult, ApexMediationError>) -> Void) {
        guard initialized, let options = self.options else {
            completion(.failure(.notInitialized)); return
        }
        guard !opts.placementId.isEmpty else { completion(.failure(.invalidPlacement)); return }

        // Offline deterministic stub if no auction URL configured
        guard let auctionUrl = options.auctionUrl else {
            let stub = InterstitialResult(adapter: "stub", ecpm: 1.23, currency: "USD", creativeId: "stub", adMarkup: "<div>ad</div>")
            completion(.success(stub))
            return
        }

        // Build JSON request, similar to Web SDK
        let timeoutMs = opts.timeoutMs ?? options.defaultTimeoutMs
        let body: [String: Any] = buildBidRequest(placementId: opts.placementId, floor: opts.floorCpm, adapters: opts.adapters, metadata: opts.metadata, timeoutMs: timeoutMs)
        guard let httpBody = try? JSONSerialization.data(withJSONObject: body, options: []) else {
            completion(.failure(.other(reason: "error"))); return
        }

        var req = URLRequest(url: auctionUrl.appendingPathComponent("/v1/auction"))
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue(options.apiKey, forHTTPHeaderField: "X-Api-Key")
        req.httpBody = httpBody

        let cfg = ApexMediation.sessionConfigProvider()
        cfg.timeoutIntervalForRequest = TimeInterval(timeoutMs) / 1000.0
        cfg.timeoutIntervalForResource = TimeInterval(timeoutMs) / 1000.0
        let session = URLSession(configuration: cfg)

        let task = session.dataTask(with: req) { data, resp, err in
            // Timeout / network mapping
            if let err = err as NSError? {
                if err.domain == NSURLErrorDomain && (err.code == NSURLErrorTimedOut || err.code == NSURLErrorCancelled) {
                    completion(.failure(.timeout)); return
                }
            }
            guard let http = resp as? HTTPURLResponse else {
                completion(.failure(.other(reason: "error"))); return
            }
            let status = http.statusCode
            if status == 204 {
                completion(.failure(.noFill)); return
            }
            guard (200...299).contains(status) else {
                completion(.failure(.status(code: status))); return
            }
            guard let data = data else {
                completion(.failure(.other(reason: "error"))); return
            }
            // Parse JSON and map to result
            do {
                if let root = try JSONSerialization.jsonObject(with: data, options: []) as? [String: Any] {
                    if let winner = root["winner"] as? [String: Any] {
                        let adapter = (winner["adapter_name"] as? String) ?? (winner["AdapterName"] as? String) ?? "unknown"
                        let ecpm = (winner["cpm"] as? Double) ?? (winner["CPM"] as? Double) ?? 0
                        let currency = (winner["currency"] as? String) ?? (winner["Currency"] as? String) ?? "USD"
                        let creativeId = (winner["creative_id"] as? String) ?? (winner["CreativeID"] as? String)
                        let adMarkup = (winner["ad_markup"] as? String) ?? (winner["AdMarkup"] as? String)
                        completion(.success(InterstitialResult(adapter: adapter, ecpm: ecpm, currency: currency, creativeId: creativeId, adMarkup: adMarkup)))
                        return
                    } else {
                        completion(.failure(.noFill)); return
                    }
                }
                completion(.failure(.other(reason: "error")))
            } catch {
                completion(.failure(.other(reason: "error")))
            }
        }
        task.resume()
    }

    private func buildBidRequest(placementId: String, floor: Double?, adapters: [String]?, metadata: [String:String]?, timeoutMs: Int) -> [String: Any] {
        let reqId = "ios-\(Int(Date().timeIntervalSince1970 * 1000))-\(Int.random(in: 0..<1_000_000))"
        let deviceInfo: [String: Any] = [
            "os": "ios",
            "os_version": UIDevice.current.systemVersion,
            "make": "Apple",
            "model": UIDevice.current.model,
            "screen_width": Int(UIScreen.main.bounds.width.rounded()),
            "screen_height": Int(UIScreen.main.bounds.height.rounded()),
            "language": Locale.current.identifier,
            "timezone": TimeZone.current.identifier,
            "connection_type": "unknown",
            "ip": "",
            "user_agent": ""
        ]
        let userInfo: [String: Any] = [
            "advertising_id": "", // IDFA not accessed in this MVP; respect ATT later
            "limit_ad_tracking": consent.limitAdTracking ?? false,
            "consent_string": consent.consentString ?? ""
        ]
        var meta = metadata ?? [:]
        if let gdpr = consent.gdprApplies { meta["gdpr_applies"] = gdpr ? "1" : "0" }
        if let ccpa = consent.ccpaUspString { meta["us_privacy"] = ccpa }
        if let coppa = consent.coppa { meta["coppa"] = coppa ? "1" : "0" }

        return [
            "request_id": reqId,
            "app_id": options?.publisherId ?? "",
            "placement_id": placementId,
            "ad_type": "interstitial",
            "device_info": deviceInfo,
            "user_info": userInfo,
            "floor_cpm": floor ?? 0,
            "timeout_ms": timeoutMs,
            "auction_type": "header_bidding",
            "adapters": (adapters?.isEmpty == false ? adapters! : ["admob","meta","unity","applovin","ironsource"]),
            "metadata": meta
        ]
    }
}
