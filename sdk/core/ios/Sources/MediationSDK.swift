import Foundation
import UIKit

/**
 * Main entry point for Rival ApexMediation iOS SDK
 *
 * Thread-Safety Guarantees:
 * - All network I/O on background queues
 * - Main queue only for UI updates
 * - Actor-based concurrency model (Swift 5.5+)
 *
 * Performance Targets:
 * - Cold start: ≤100ms
 * - Warm start: ≤50ms
 * - Memory footprint: ≤10MB
 */
@MainActor
public final class MediationSDK {
    
    // MARK: - Singleton
    
    public static let shared = MediationSDK()
    
    private init() {}
    
    // MARK: - Properties
    
    private var config: SDKConfig?
    private var isInitialized = false
    
    private let backgroundQueue = DispatchQueue(
        label: "com.rivalapexmediation.sdk.background",
        qos: .userInitiated,
        attributes: .concurrent
    )
    
    private let networkQueue = DispatchQueue(
        label: "com.rivalapexmediation.sdk.network",
        qos: .userInitiated,
        attributes: .concurrent
    )
    
    private lazy var configManager: ConfigManager = {
        ConfigManager(config: self.config!)
    }()
    
    private lazy var telemetry: TelemetryCollector = {
        TelemetryCollector(config: self.config!)
    }()
    
    private lazy var adapterRegistry: AdapterRegistry = {
        AdapterRegistry()
    }()
    
    private var circuitBreakers: [String: CircuitBreaker] = [:]
    
    // MARK: - Initialization
    
    /**
     * Initialize the SDK
     *
     * Must be called from main thread, typically in AppDelegate
     *
     * - Parameters:
     *   - appId: Your application ID from Rival ApexMediation
     *   - config: Optional SDK configuration
     * - Throws: SDKError if initialization fails
     */
    public func initialize(appId: String, config: SDKConfig = SDKConfig()) async throws {
        guard !isInitialized else {
            throw SDKError.alreadyInitialized
        }
        
        self.config = config.with(appId: appId)
        
        // Perform heavy initialization on background queue
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            backgroundQueue.async { [weak self] in
                guard let self = self else {
                    continuation.resume(throwing: SDKError.internalError)
                    return
                }
                
                do {
                    // Load configuration
                    try self.configManager.loadConfig()
                    
                    // Initialize adapters
                    try self.adapterRegistry.initialize()
                    
                    // Start telemetry
                    self.telemetry.start()
                    
                    // Record initialization
                    self.telemetry.recordInitialization()
                    
                    self.isInitialized = true
                    continuation.resume()
                } catch {
                    self.telemetry.recordError("initialization_failed", error: error)
                    continuation.resume(throwing: error)
                }
            }
        }
    }
    
    // MARK: - Ad Loading
    
    /**
     * Load an ad for the specified placement
     *
     * - Parameters:
     *   - placement: The ad placement identifier
     * - Returns: Loaded ad or nil if no fill
     * - Throws: SDKError on failure
     */
    public func loadAd(placement: String) async throws -> Ad? {
        guard isInitialized else {
            throw SDKError.notInitialized
        }
        
        let startTime = Date()
        
        return try await withCheckedThrowingContinuation { continuation in
            backgroundQueue.async { [weak self] in
                guard let self = self else {
                    continuation.resume(throwing: SDKError.internalError)
                    return
                }
                
                do {
                    // Get placement configuration
                    guard let placementConfig = try self.configManager.getPlacementConfig(placement) else {
                        throw SDKError.invalidPlacement(placement)
                    }
                    
                    // Get enabled adapters
                    let adapters = self.getEnabledAdapters(for: placementConfig)
                    
                    guard !adapters.isEmpty else {
                        continuation.resume(returning: nil)
                        return
                    }
                    
                    // Parallel loading with timeout
                    let group = DispatchGroup()
                    var responses: [AdResponse] = []
                    let responsesLock = NSLock()
                    
                    for adapter in adapters {
                        group.enter()
                        self.networkQueue.async {
                            defer { group.leave() }
                            
                            if let response = self.loadWithCircuitBreaker(
                                adapter: adapter,
                                placement: placement,
                                config: placementConfig
                            ) {
                                responsesLock.lock()
                                responses.append(response)
                                responsesLock.unlock()
                            }
                        }
                    }
                    
                    // Wait with timeout
                    let timeout = DispatchTimeInterval.milliseconds(Int(placementConfig.timeoutMs))
                    let result = group.wait(timeout: .now() + timeout)
                    
                    if result == .timedOut {
                        self.telemetry.recordTimeout(placement: placement)
                    }
                    
                    // Select best ad
                    let bestAd = self.selectBestAd(from: responses)
                    
                    let latency = Date().timeIntervalSince(startTime) * 1000
                    self.telemetry.recordAdLoad(
                        placement: placement,
                        latency: latency,
                        success: bestAd != nil
                    )
                    
                    continuation.resume(returning: bestAd)
                    
                } catch {
                    self.telemetry.recordError("load_ad_failed", error: error)
                    continuation.resume(throwing: error)
                }
            }
        }
    }
    
    // MARK: - Private Methods
    
    private func loadWithCircuitBreaker(
        adapter: AdAdapter,
        placement: String,
        config: PlacementConfig
    ) -> AdResponse? {
        let breaker = circuitBreakers[adapter.name] ?? CircuitBreaker(
            failureThreshold: 5,
            resetTimeoutMs: 60000
        )
        circuitBreakers[adapter.name] = breaker
        
        return breaker.execute {
            return try adapter.loadAd(placement: placement, config: config)
        }
    }
    
    private func getEnabledAdapters(for config: PlacementConfig) -> [AdAdapter] {
        return config.enabledNetworks.compactMap { networkId in
            guard let adapter = adapterRegistry.getAdapter(networkId) else {
                return nil
            }
            
            // Check if adapter is available and circuit breaker is not open
            guard adapter.isAvailable(),
                  let breaker = circuitBreakers[adapter.name],
                  !breaker.isOpen else {
                return nil
            }
            
            return adapter
        }
    }
    
    private func selectBestAd(from responses: [AdResponse]) -> Ad? {
        return responses
            .filter { $0.isValid }
            .max(by: { $0.ecpm < $1.ecpm })
            ?.ad
    }
    
    // MARK: - Public API
    
    /**
     * Check if an ad is ready to show
     */
    public func isAdReady(placement: String) -> Bool {
        // TODO: Implement caching
        return false
    }
    
    /**
     * Shutdown SDK and cleanup resources
     */
    public func shutdown() {
        backgroundQueue.async { [weak self] in
            guard let self = self else { return }
            
            self.telemetry.stop()
            self.adapterRegistry.shutdown()
            self.configManager.shutdown()
            
            self.isInitialized = false
        }
    }
}

// MARK: - Configuration

public struct SDKConfig {
    public let appId: String
    public let testMode: Bool
    public let logLevel: LogLevel
    public let telemetryEnabled: Bool
    public let configEndpoint: String
    public let auctionEndpoint: String
    
    public init(
        appId: String = "",
        testMode: Bool = false,
        logLevel: LogLevel = .info,
        telemetryEnabled: Bool = true,
        configEndpoint: String = "https://config.rivalapexmediation.com",
        auctionEndpoint: String = "https://auction.rivalapexmediation.com"
    ) {
        self.appId = appId
        self.testMode = testMode
        self.logLevel = logLevel
        self.telemetryEnabled = telemetryEnabled
        self.configEndpoint = configEndpoint
        self.auctionEndpoint = auctionEndpoint
    }
    
    func with(appId: String) -> SDKConfig {
        return SDKConfig(
            appId: appId,
            testMode: testMode,
            logLevel: logLevel,
            telemetryEnabled: telemetryEnabled,
            configEndpoint: configEndpoint,
            auctionEndpoint: auctionEndpoint
        )
    }
}

public enum LogLevel {
    case verbose
    case debug
    case info
    case warning
    case error
}

// MARK: - Errors

public enum SDKError: Error, LocalizedError {
    case notInitialized
    case alreadyInitialized
    case invalidPlacement(String)
    case noFill
    case timeout
    case networkError
    case internalError
    
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
        case .networkError:
            return "Network error occurred."
        case .internalError:
            return "Internal error occurred."
        }
    }
}
