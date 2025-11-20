import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

/// Configuration manager with remote fetching and caching
///
/// Features:
/// - Remote config fetching with Ed25519 signature verification
/// - UserDefaults caching with TTL
/// - Async/await concurrency
/// - Automatic retry with exponential backoff
public final class ConfigManager {
    private let config: SDKConfig
    private let urlSession: URLSession
    private let userDefaults: UserDefaults
    private let signatureVerifier: SignatureVerifier?
    
    private let cacheKey = "com.rivalapexmediation.config"
    private let cacheVersionKey = "com.rivalapexmediation.config.version"
    private let cacheTimestampKey = "com.rivalapexmediation.config.timestamp"
    
    private let cacheTTL: TimeInterval = 3600 // 1 hour
    
    private var cachedConfig: SDKRemoteConfig?
    
    /// Initialize config manager
    public init(config: SDKConfig, signatureVerifier: SignatureVerifier?) {
        self.config = config
        self.signatureVerifier = signatureVerifier
        
        let configuration = URLSessionConfiguration.default
        configuration.timeoutIntervalForRequest = 10
        configuration.timeoutIntervalForResource = 30
        self.urlSession = URLSession(configuration: configuration)
        
        self.userDefaults = UserDefaults.standard
    }
    
    /// Load configuration (cache-first)
    public func loadConfig() async throws -> SDKRemoteConfig {
        // Check cache first
        if let cached = loadCachedConfig(), !isCacheExpired() {
            cachedConfig = cached
            return cached
        }
        
        // Fetch from remote
        let remoteConfig = try await fetchRemoteConfig()
        
        // Verify signature when verifier available
        if let verifier = signatureVerifier {
            try verifySignature(config: remoteConfig, verifier: verifier)
        }
        
        // Cache the config
        cacheConfig(remoteConfig)
        
        cachedConfig = remoteConfig
        return remoteConfig
    }
    
    /// Get placement config by ID
    public func getPlacement(id: String) -> PlacementConfig? {
        return cachedConfig?.placements.first { $0.placementId == id }
    }

    /// Convenience accessor used by the mediation layer
    public func getPlacementConfig(_ id: String) -> PlacementConfig? {
        getPlacement(id: id)
    }
    
    /// Check if adapter is enabled
    public func isAdapterEnabled(name: String) -> Bool {
        return cachedConfig?.adapters[name]?.enabled ?? false
    }
    
    /// Get adapter configuration
    public func getAdapterConfig(name: String) -> [String: Any]? {
        return cachedConfig?.adapters[name]?.settings.mapValues { $0.value }
    }
    
    /// Check if kill switch is active
    public func isKillSwitchActive(name: String) -> Bool {
        return cachedConfig?.killswitches.contains(name) ?? false
    }
    
    // MARK: - Remote Fetching
    
    /// Fetch configuration from remote endpoint
    private func fetchRemoteConfig() async throws -> SDKRemoteConfig {
        let url = URL(string: "\(config.configEndpoint)/v1/config/\(config.appId)")!
        
        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.addValue("RivalApexMediation-iOS/1.0.0", forHTTPHeaderField: "User-Agent")
        request.addValue("application/json", forHTTPHeaderField: "Accept")
        
        let (data, response) = try await urlSession.data(for: request)
        
        guard let httpResponse = response as? HTTPURLResponse else {
            throw ConfigError.invalidResponse
        }
        
        guard httpResponse.statusCode == 200 else {
            throw ConfigError.httpError(statusCode: httpResponse.statusCode)
        }
        
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        
        do {
            return try decoder.decode(SDKRemoteConfig.self, from: data)
        } catch {
            throw ConfigError.decodingError(error)
        }
    }
    
    /// Fetch configuration with retry
    public func fetchWithRetry(maxAttempts: Int = 3) async throws -> SDKRemoteConfig {
        var lastError: Error?
        
        for attempt in 0..<maxAttempts {
            do {
                return try await fetchRemoteConfig()
            } catch {
                lastError = error
                
                if attempt < maxAttempts - 1 {
                    // Exponential backoff: 1s, 2s, 4s
                    let delay = pow(2.0, Double(attempt))
                    try await Task.sleep(nanoseconds: UInt64(delay * 1_000_000_000))
                }
            }
        }
        
        throw lastError ?? ConfigError.unknownError
    }
    
    // MARK: - Signature Verification
    
    /// Verify Ed25519 signature
    private func verifySignature(config: SDKRemoteConfig, verifier: SignatureVerifier) throws {
        guard let signature = config.signature else {
            throw ConfigError.missingSignature
        }

        let payload = createSignaturePayload(config: config)

        do {
            try verifier.verifySignature(message: payload, signatureBase64: signature)
        } catch let error as SignatureError {
            throw ConfigError.signatureVerificationFailed(error)
        } catch {
            throw ConfigError.signatureVerificationFailed(error)
        }
    }
    
    /// Create signature payload
    private func createSignaturePayload(config: SDKRemoteConfig) -> String {
        // Canonical representation for signature verification
        var parts: [String] = []
        
        parts.append("version:\(config.version)")
        parts.append("placements:\(config.placements.count)")
        parts.append("adapters:\(config.adapters.count)")
        parts.append("killswitches:\(config.killswitches.joined(separator: ","))")
        parts.append("telemetry:\(config.telemetryEnabled)")
        
        return parts.joined(separator: "|")
    }
    
    // MARK: - Caching
    
    /// Cache configuration
    private func cacheConfig(_ config: SDKRemoteConfig) {
        let encoder = JSONEncoder()
        encoder.keyEncodingStrategy = .convertToSnakeCase
        
        if let data = try? encoder.encode(config) {
            userDefaults.set(data, forKey: cacheKey)
            userDefaults.set(config.version, forKey: cacheVersionKey)
            userDefaults.set(Date().timeIntervalSince1970, forKey: cacheTimestampKey)
        }
    }
    
    /// Load cached configuration
    private func loadCachedConfig() -> SDKRemoteConfig? {
        guard let data = userDefaults.data(forKey: cacheKey) else {
            return nil
        }
        
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        
        return try? decoder.decode(SDKRemoteConfig.self, from: data)
    }
    
    /// Check if cache is expired
    private func isCacheExpired() -> Bool {
        let timestamp = userDefaults.double(forKey: cacheTimestampKey)
        
        if timestamp == 0 {
            return true
        }
        
        let age = Date().timeIntervalSince1970 - timestamp
        return age > cacheTTL
    }
    
    /// Get cached version
    public func getCachedVersion() -> Int {
        return userDefaults.integer(forKey: cacheVersionKey)
    }
    
    /// Clear cache
    public func clearCache() {
        userDefaults.removeObject(forKey: cacheKey)
        userDefaults.removeObject(forKey: cacheVersionKey)
        userDefaults.removeObject(forKey: cacheTimestampKey)
        cachedConfig = nil
    }
    
    /// Release resources and clear cached config
    public func shutdown() {
        urlSession.invalidateAndCancel()
        cachedConfig = nil
    }
}

// MARK: - Errors

/// Configuration errors
public enum ConfigError: Error, LocalizedError {
    case invalidResponse
    case httpError(statusCode: Int)
    case decodingError(Error)
    case missingSignature
    case invalidSignature
    case signatureVerificationFailed(Error)
    case unknownError
    
    public var errorDescription: String? {
        switch self {
        case .invalidResponse:
            return "Invalid response from server"
        case .httpError(let statusCode):
            return "HTTP error: \(statusCode)"
        case .decodingError(let error):
            return "Failed to decode config: \(error.localizedDescription)"
        case .missingSignature:
            return "Configuration signature missing"
        case .invalidSignature:
            return "Invalid configuration signature"
        case .signatureVerificationFailed(let error):
            return "Signature verification failed: \(error.localizedDescription)"
        case .unknownError:
            return "Unknown error occurred"
        }
    }
}
