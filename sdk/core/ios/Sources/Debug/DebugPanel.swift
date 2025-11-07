import Foundation
import UIKit

/// Minimal in-app debug panel for iOS mirroring Android's DebugPanel.
/// Safe to ship; shows basic SDK state and allows copy to clipboard.
public enum DebugPanel {
    public static func show(from viewController: UIViewController) {
        let sdk = MediationSDK.shared
        let appId = sdk.currentAppId() ?? ""
        let placements = sdk.currentPlacementIds().joined(separator: ", ")
        let message = "Apex Mediation — Debug Panel\nApp ID: \(appId)\nPlacements: \(placements)\n"
        let alert = UIAlertController(title: "Mediation Debugger", message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "Copy", style: .default, handler: { _ in
            UIPasteboard.general.string = message
        }))
        alert.addAction(UIAlertAction(title: "Close", style: .cancel, handler: nil))
        viewController.present(alert, animated: true)
    }
}
