import Foundation
import AVKit

public final class RewardedAd {
    private let placementId: String
    private var win: AuctionWin?

    public init(placementId: String) { self.placementId = placementId }

    public func load(floorCpm: Double = 0.0, completion: @escaping (_ error: String?) -> Void) {
        let sdk = ApexMediation.shared
        guard sdk.isInitialized else { completion("not_initialized"); return }
        sdk.client.requestBid(placementId: placementId, adFormat: "rewarded", floorCpm: floorCpm, consent: sdk.consent) { res in
            if res.noFill { completion("no_fill"); return }
            if let e = res.error { completion(e); return }
            self.win = res.win
            completion(self.win != nil ? nil : "no_fill")
        }
    }

    public var isReady: Bool { win != nil }

    public func show(on viewController: UIViewController, completion: @escaping (_ error: String?) -> Void, closed: @escaping () -> Void) {
        guard let w = win else { completion("not_ready"); return }
        let player = AVPlayer(url: URL(string: w.creativeUrl)!)
        let controller = AVPlayerViewController()
        controller.player = player
        controller.modalPresentationStyle = .fullScreen
        viewController.present(controller, animated: true) {
            Beacon.fire(w.tracking.impression)
            controller.player?.play()
            completion(nil)
        }
        NotificationCenter.default.addObserver(forName: .AVPlayerItemDidPlayToEndTime, object: player.currentItem, queue: .main) { _ in
            controller.dismiss(animated: true, completion: closed)
        }
    }
}
