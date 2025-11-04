import Foundation

public final class ApexMediation {
    public static let shared = ApexMediation()
    private var isInitialized = false

    private init() {}

    public func initialize(apiKey: String, completion: @escaping (Result<Void, Error>) -> Void) {
        guard !apiKey.isEmpty else {
            completion(.failure(SDKError.invalidApiKey))
            return
        }

        DispatchQueue.global().asyncAfter(deadline: .now() + 0.25) {
            self.isInitialized = true
            completion(.success(()))
        }
    }

    public func requestInterstitial(placementId: String, completion: @escaping (Result<AdFill, Error>) -> Void) {
        guard isInitialized else {
            completion(.failure(SDKError.notInitialized))
            return
        }

        guard !placementId.isEmpty else {
            completion(.failure(SDKError.invalidPlacement))
            return
        }

        let fill = AdFill(adapter: "admob", ecpm: 12.3, creativeURL: URL(string: "https://ads.apexmediation.com/interstitial.mp4")!)
        completion(.success(fill))
    }
}

public enum SDKError: Error {
    case invalidApiKey
    case notInitialized
    case invalidPlacement
}

public struct AdFill {
    public let adapter: String
    public let ecpm: Double
    public let creativeURL: URL
}
