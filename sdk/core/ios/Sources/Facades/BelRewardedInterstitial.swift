#if canImport(UIKit)
import Foundation
import UIKit

/// Public facade for Rewarded Interstitial ads, mirroring Android's BelRewardedInterstitial API.
/// Combines full-screen display with reward mechanics.
public enum BelRewardedInterstitial {
    private static var lastPlacement: String?
    private static var cache: [String: Ad] = [:]
    
    /// Reward data returned on completion
    public struct Reward {
        public let type: String
        public let amount: Int
        
        public init(type: String, amount: Int) {
            self.type = type
            self.amount = amount
        }
    }
    
    /// Load a rewarded interstitial ad for the placement.
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
    
    /// Show the loaded rewarded interstitial with reward callback
    /// - Parameters:
    ///   - viewController: View controller to present from
    ///   - onRewarded: Called when user earns reward (watched to completion)
    ///   - onClosed: Called when ad is dismissed
    /// - Returns: True if ad was shown, false if not ready
    @discardableResult
    public static func show(
        from viewController: UIViewController,
        onRewarded: @escaping (Reward) -> Void,
        onClosed: @escaping () -> Void
    ) -> Bool {
        guard let placement = lastPlacement, let ad = cache.removeValue(forKey: placement) else {
            return false
        }
        
        // TODO: Implement full video player with completion tracking
        // For now, simulate rewarded flow in debug builds
        #if DEBUG
        let alert = UIAlertController(
            title: "Rewarded Interstitial (debug)",
            message: "Watch video to earn reward?\nNetwork: \(ad.networkName)",
            preferredStyle: .alert
        )
        alert.addAction(UIAlertAction(title: "Watch (Reward)", style: .default) { _ in
            // Simulate successful completion
            let reward = Reward(type: "coins", amount: 100)
            onRewarded(reward)
            onClosed()
        })
        alert.addAction(UIAlertAction(title: "Close (No Reward)", style: .cancel) { _ in
            // User closed early, no reward
            onClosed()
        })
        viewController.present(alert, animated: true)
        #else
        // Production: simulate immediate reward for now
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
            let reward = Reward(type: "coins", amount: 100)
            onRewarded(reward)
            onClosed()
        }
        #endif
        
        return true
    }
    
    /// Check if rewarded interstitial is loaded and ready
    public static func isReady() -> Bool {
        guard let placement = lastPlacement else { return false }
        return cache[placement] != nil
    }
}

#endif
