import Foundation

public struct AuctionWin: Codable, Equatable {
    public let requestId: String
    public let bidId: String
    public let adapter: String
    public let cpm: Double
    public let currency: String
    public let ttlSeconds: Int
    public let creativeUrl: String
    public let tracking: Tracking
    public struct Tracking: Codable, Equatable { public let impression: String; public let click: String }
}

public final class AuctionClient {
    private let config: SDKConfig
    private let session: URLSession

    public init(config: SDKConfig, session: URLSession = URLSession(configuration: .default)) {
        self.config = config
        self.session = session
    }

    public struct Result {
        public let win: AuctionWin?
        public let noFill: Bool
        public let error: String?
    }

    public func requestBid(placementId: String,
                           adFormat: String,
                           floorCpm: Double = 0,
                           consent: ConsentData?,
                           completion: @escaping (Result) -> Void) {
        let requestId = UUID().uuidString
        var body: [String: Any] = [
            "requestId": requestId,
            "placementId": placementId,
            "adFormat": adFormat,
            "floorCpm": floorCpm,
            "device": ["platform": "ios", "osVersion": ProcessInfo.processInfo.operatingSystemVersionString, "model": "AppleTV"],
            "app": ["id": config.appId]
        ]
        if let c = consent {
            var m: [String: Any] = [:]
            if let g = c.gdprApplies { m["gdpr"] = g ? 1 : 0 }
            if let t = c.tcfString, !t.isEmpty { m["gdpr_consent"] = t }
            if let u = c.usPrivacy, !u.isEmpty { m["us_privacy"] = u }
            if let cp = c.coppa { m["coppa"] = cp }
            body["consent"] = m
        }
        let envelope = ["body": body]
        guard let data = try? JSONSerialization.data(withJSONObject: envelope) else {
            completion(Result(win: nil, noFill: false, error: "encode_error")); return
        }
        let url = URL(string: config.apiBaseUrl.trimmingCharacters(in: CharacterSet(charactersIn: "/")) + "/rtb/bid")!
        var req = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: TimeInterval(config.requestTimeoutMs) / 1000.0)
        req.httpMethod = "POST"
        req.addValue("application/json", forHTTPHeaderField: "Content-Type")
        if let key = config.apiKey { req.addValue("Bearer \(key)", forHTTPHeaderField: "Authorization") }
        req.httpBody = data

        let task = session.dataTask(with: req) { d, r, e in
            if let e = e { completion(Result(win: nil, noFill: false, error: "network_error")); return }
            guard let http = r as? HTTPURLResponse else { completion(Result(win: nil, noFill: false, error: "no_response")); return }
            if http.statusCode == 204 { completion(Result(win: nil, noFill: true, error: nil)); return }
            guard http.statusCode >= 200 && http.statusCode < 300 else {
                let code: String
                switch http.statusCode { case 400: code = "invalid_request"; case 401: code = "unauthorized"; case 429: code = "rate_limited"; case 500...599: code = "server_error"; default: code = "http_\(http.statusCode)" }
                completion(Result(win: nil, noFill: false, error: code)); return
            }
            guard let d = d else { completion(Result(win: nil, noFill: false, error: "empty")); return }
            do {
                // Try envelope first
                if let obj = try JSONSerialization.jsonObject(with: d) as? [String: Any], let resp = obj["response"] {
                    let respData = try JSONSerialization.data(withJSONObject: resp)
                    let win = try JSONDecoder().decode(AuctionWin.self, from: respData)
                    completion(Result(win: win, noFill: false, error: nil)); return
                }
                let win = try JSONDecoder().decode(AuctionWin.self, from: d)
                completion(Result(win: win, noFill: false, error: nil))
            } catch {
                completion(Result(win: nil, noFill: false, error: "parse_error"))
            }
        }
        task.resume()
    }
}
