import Foundation
import UIKit

/// Tiny public facade for Interstitial ads, mirroring Android’s BelInterstitial API.
/// Keeps API surface stable and boring for integrators while delegating to MediationSDK.
public enum BelInterstitial {
    private static var lastPlacement: String?
    private static var cache: [String: Ad] = [:]

    /// Load an interstitial for the placement. On success, the ad is cached and isReady() will return true.
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

    /// Attempts to show the last loaded interstitial. Returns true if an ad was shown.
    /// Note: Real rendering will be added later; for now this returns whether an ad exists in cache.
    @discardableResult
    public static func show(from viewController: UIViewController) -> Bool {
        guard let placement = lastPlacement, let ad = cache.removeValue(forKey: placement) else { return false }
        // TODO: hook OM SDK measurement and real renderer when ready.
        // For now, simulate a show by presenting a lightweight placeholder view controller for a brief moment (debug builds only).
        #if DEBUG
        let vc = UIViewController()
        vc.view.backgroundColor = .systemBackground
        let label = UILabel(frame: .zero)
        label.text = "Showing interstitial (debug placeholder) — network=\(ad.networkName)"
        label.textAlignment = .center
        label.numberOfLines = 0
        label.translatesAutoresizingMaskIntoConstraints = false
        vc.view.addSubview(label)
        NSLayoutConstraint.activate([
            label.centerXAnchor.constraint(equalTo: vc.view.centerXAnchor),
            label.centerYAnchor.constraint(equalTo: vc.view.centerYAnchor),
            label.leadingAnchor.constraint(greaterThanOrEqualTo: vc.view.leadingAnchor, constant: 16),
            label.trailingAnchor.constraint(lessThanOrEqualTo: vc.view.trailingAnchor, constant: -16)
        ])
        viewController.present(vc, animated: true) {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { vc.dismiss(animated: true) }
        }
        #endif
        return true
    }

    /// Whether the last loaded interstitial is ready to be shown.
    public static func isReady() -> Bool {
        guard let placement = lastPlacement else { return false }
        return cache[placement] != nil
    }
}
