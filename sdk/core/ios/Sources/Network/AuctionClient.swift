import Foundation
#if canImport(UIKit)
import UIKit
#endif

/// Client for server-to-server auction requests
public final class AuctionClient {
    private let baseURL: String
    private let apiKey: String
    private let timeout: TimeInterval
    private let session: URLSession
    
    public init(baseURL: String, apiKey: String, timeout: TimeInterval = 5.0) {
        self.baseURL = baseURL
        self.apiKey = apiKey
        self.timeout = timeout
        
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = timeout
        config.timeoutIntervalForResource = timeout * 2
        self.session = URLSession(configuration: config)
    }
    
    /// Request a bid from the auction service
    public func requestBid(placementId: String, adType: String) async throws -> AuctionResponse {
        let request = try buildRequest(placementId: placementId, adType: adType)
        
        let (data, response) = try await session.data(for: request)
        
        guard let httpResponse = response as? HTTPURLResponse else {
            throw SDKError.networkError(underlying: "Invalid response type")
        }
        
        // Handle HTTP status codes with taxonomy mapping
        switch httpResponse.statusCode {
        case 200:
            // Success - parse response
            return try parseResponse(data: data)
            
        case 204:
            // No fill
            throw SDKError.noFill
            
        case 400:
            throw SDKError.invalidPlacement("Bad request")
            
        case 429:
            let message = String(data: data, encoding: .utf8) ?? "Rate limit exceeded"
            throw SDKError.status_429(message: message)
            
        case 500...599:
            let message = String(data: data, encoding: .utf8) ?? "Server error"
            throw SDKError.status_5xx(code: httpResponse.statusCode, message: message)
            
        default:
            throw SDKError.networkError(underlying: "HTTP \(httpResponse.statusCode)")
        }
    }
    
    private func buildRequest(placementId: String, adType: String) throws -> URLRequest {
        guard let url = URL(string: "\(baseURL)/v1/auction") else {
            throw SDKError.internalError(message: "Invalid auction URL")
        }
        
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(apiKey, forHTTPHeaderField: "X-Api-Key")
        request.setValue(userAgent(), forHTTPHeaderField: "User-Agent")
        request.timeoutInterval = timeout
        
        let body = buildRequestBody(placementId: placementId, adType: adType)
        request.httpBody = try JSONSerialization.data(withJSONObject: body)
        
        return request
    }
    
    private func buildRequestBody(placementId: String, adType: String) -> [String: Any] {
        var body: [String: Any] = [
            "placementId": placementId,
            "adType": adType,
            "device": deviceInfo(),
            "app": appInfo()
        ]
        
        // Add consent metadata
        let consentMetadata = ConsentManager.shared.toAdRequestMetadata()
        if !consentMetadata.isEmpty {
            body["consent"] = consentMetadata
        }
        
        return body
    }
    
    private func deviceInfo() -> [String: Any] {
        var info: [String: Any] = [:]
        
        #if canImport(UIKit)
        let device = UIDevice.current
        info["platform"] = "iOS"
        info["osVersion"] = device.systemVersion
        info["model"] = device.model
        info["language"] = Locale.current.languageCode ?? "en"
        
        let screen = UIScreen.main
        info["screenWidth"] = Int(screen.bounds.width * screen.scale)
        info["screenHeight"] = Int(screen.bounds.height * screen.scale)
        info["screenScale"] = screen.scale
        
        // Add advertising identifier if available and consent allows
        if ConsentManager.shared.canShowPersonalizedAds() {
            // TODO: Implement IDFA retrieval with ATT framework
            // For now, omit until ATTrackingManager integration is added
        }
        #endif
        
        return info
    }
    
    private func appInfo() -> [String: Any] {
        let bundle = Bundle.main
        return [
            "bundleId": bundle.bundleIdentifier ?? "unknown",
            "version": bundle.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "1.0",
            "build": bundle.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "1"
        ]
    }
    
    private func userAgent() -> String {
        let version = "1.0.0"
        #if canImport(UIKit)
        let device = UIDevice.current
        let os = "\(device.systemName)/\(device.systemVersion)"
        return "ApexMediation-iOS/\(version) (\(os))"
        #else
        return "ApexMediation-iOS/\(version)"
        #endif
    }
    
    private func parseResponse(data: Data) throws -> AuctionResponse {
        do {
            let decoder = JSONDecoder()
            decoder.keyDecodingStrategy = .convertFromSnakeCase
            return try decoder.decode(AuctionResponse.self, from: data)
        } catch {
            throw SDKError.internalError(message: "Failed to parse auction response: \(error.localizedDescription)")
        }
    }
}

/// Auction response model
public struct AuctionResponse: Codable {
    public let adId: String
    public let networkName: String
    public let creativeUrl: String?
    public let ecpm: Double?
    public let ttl: Int?
    public let metadata: [String: String]?
    
    enum CodingKeys: String, CodingKey {
        case adId = "ad_id"
        case networkName = "network_name"
        case creativeUrl = "creative_url"
        case ecpm
        case ttl
        case metadata
    }
}
