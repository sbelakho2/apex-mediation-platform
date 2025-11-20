#if canImport(UIKit)
import Foundation
import UIKit

/// Public facade for App Open ads, mirroring Android's BelAppOpen API.
/// Displayed when app transitions from background to foreground.
public enum BelAppOpen {
    private static var lastPlacement: String?
    private static var cache: [String: Ad] = [:]
    private static var lastShowTime: Date?
    private static let minimumHoursBetweenShows: TimeInterval = 4 * 3600 // 4 hours
    
    /// Load an app open ad for the placement.
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
    
    /// Show the loaded app open ad
    /// - Parameters:
    ///   - viewController: View controller to present from
    ///   - onClosed: Called when ad is dismissed
    /// - Returns: True if ad was shown, false if not ready or shown too recently
    @discardableResult
    public static func show(
        from viewController: UIViewController,
        onClosed: @escaping () -> Void
    ) -> Bool {
        // Check if shown too recently (rate limiting)
        if let lastShow = lastShowTime {
            let timeSinceLastShow = Date().timeIntervalSince(lastShow)
            if timeSinceLastShow < minimumHoursBetweenShows {
                return false
            }
        }
        
        guard let placement = lastPlacement, let ad = cache.removeValue(forKey: placement) else {
            return false
        }
        
        lastShowTime = Date()
        
        // TODO: Implement full-screen app open creative rendering
        // For now, simulate in debug builds
        #if DEBUG
        let vc = UIViewController()
        vc.view.backgroundColor = .systemBackground
        vc.modalPresentationStyle = .fullScreen
        
        let label = UILabel(frame: .zero)
        label.text = "App Open Ad (debug)\n\(ad.networkName)"
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
            DispatchQueue.main.asyncAfter(deadline: .now() + 2.0) {
                vc.dismiss(animated: true) {
                    onClosed()
                }
            }
        }
        #else
        // Production: simulate immediate close
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
            onClosed()
        }
        #endif
        
        return true
    }
    
    /// Check if app open ad is loaded and ready
    public static func isReady() -> Bool {
        guard let placement = lastPlacement else { return false }
        return cache[placement] != nil
    }
    
    /// Reset the show time limit (for testing purposes)
    public static func resetShowTimeLimit() {
        lastShowTime = nil
    }
}

#endif
