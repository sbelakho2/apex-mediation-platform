import Foundation
#if canImport(StoreKit) && !os(Linux)
import StoreKit
#if canImport(AdAttributionKit)
import AdAttributionKit
#endif

public final class AttributionManager {
    public static let shared = AttributionManager()
    private init() {}

    private var postbackHandler: ((String) -> Void)?

    /// Register a handler that receives SKAdNetwork and (future) AdAttributionKit payloads for developer forwarding.
    public func onPostback(_ handler: @escaping (String) -> Void) {
        postbackHandler = handler
    }

    /// Forward SKAdNetwork postbacks (decoded upstream) to the developer handler.
    @available(tvOS 16.1, *)
    public func handle(postback: SKAdNetwork.AttributionPostback) {
        if let data = try? JSONEncoder().encode(postback), let json = String(data: data, encoding: .utf8) {
            postbackHandler?(json)
        }
    }

    /// Allow apps to forward raw postback payloads (e.g., from server-to-server flows).
    public func handlePostbackPayload(_ data: Data) {
        guard let json = String(data: data, encoding: .utf8) else { return }
        postbackHandler?(json)
    }

    /// Update the conversion value while respecting platform capabilities.
    public func updateConversionValue(_ value: Int, coarseValue: SKAdNetwork.CoarseConversionValue? = nil, lockWindow: Bool = false) {
        if #available(tvOS 16.1, *) {
            SKAdNetwork.updatePostbackConversionValue(value, coarseValue: coarseValue, lockWindow: lockWindow, completionHandler: { _, _ in })
        } else if #available(tvOS 14.0, *) {
            SKAdNetwork.updateConversionValue(value)
        }
    }

    /// Placeholder bridge for AdAttributionKit tokens. When tvOS 18+ support lands, we surface the token through the same handler.
    @available(tvOS 18.0, *)
    public func submitAdAttributionToken(_ token: Data) {
        #if canImport(AdAttributionKit)
                if let tokenString = String(data: token, encoding: .utf8) {
                    postbackHandler?(tokenString)
                }
        #else
                if let tokenString = String(data: token, encoding: .utf8) {
                    postbackHandler?(tokenString)
                }
        #endif
    }
}
#else
public final class AttributionManager {
    public static let shared = AttributionManager()
    private init() {}
    public func onPostback(_ handler: @escaping (String) -> Void) {}
    public func handle(postback: Any) {}
    public func handlePostbackPayload(_ data: Data) {}
    public func updateConversionValue(_ value: Int, coarseValue: Any? = nil, lockWindow: Bool = false) {}
    public func submitAdAttributionToken(_ token: Data) {}
}
#endif
