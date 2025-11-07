import Foundation
import UIKit

/// Tiny public facade for Rewarded ads, mirroring Android’s BelRewarded API.
public enum BelRewarded {
    private static var lastPlacement: String?
    private static var cache: [String: Ad] = [:]

    /// Load a rewarded ad for the placement. On success, the ad is cached and isReady() will return true.
    public static func load(placementId: String, completion: @escaping (Result<Ad, Error>) -> Void) {
        lastPlacement = placementId
        Task { @MainActor in
            do {
                let ad = try await MediationSDK.shared.loadAd(placementId: placementId)
                if let ad = ad {
                    cache[placementId] = ad
                    completion(.success(ad))
                } else {
                    completion(.failure(SDKError.noFill))
                }
            } catch {
                completion(.failure(error))
            }
        }
    }

    /// Attempts to show the last loaded rewarded ad. Returns true if an ad was shown.
    @discardableResult
    public static func show(from viewController: UIViewController) -> Bool {
        guard let placement = lastPlacement, let _ = cache.removeValue(forKey: placement) else { return false }
        // TODO: hook video renderer and reward callback in future pass.
        #if DEBUG
        let alert = UIAlertController(title: "Rewarded (debug placeholder)", message: "Simulating rewarded show for placement: \(placement)", preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "OK", style: .default, handler: nil))
        viewController.present(alert, animated: true)
        #endif
        return true
    }

    public static func isReady() -> Bool {
        guard let placement = lastPlacement else { return false }
        return cache[placement] != nil
    }
}
