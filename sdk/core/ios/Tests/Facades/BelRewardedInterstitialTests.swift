import XCTest
@testable import RivalApexMediationSDK

#if canImport(UIKit)
import UIKit

@MainActor
final class BelRewardedInterstitialTests: XCTestCase {
    
    func testIsReadyBeforeLoad() {
        XCTAssertFalse(BelRewardedInterstitial.isReady())
    }
    
    func testRewardStructure() {
        let reward = BelRewardedInterstitial.Reward(type: "coins", amount: 100)
        
        XCTAssertEqual(reward.type, "coins")
        XCTAssertEqual(reward.amount, 100)
    }
    
    func testShowWithoutLoad() {
        let vc = UIViewController()
        var rewardCalled = false
        var closedCalled = false
        
        let shown = BelRewardedInterstitial.show(
            from: vc,
            onRewarded: { _ in rewardCalled = true },
            onClosed: { closedCalled = true }
        )
        
        XCTAssertFalse(shown, "Should not show when no ad is loaded")
        XCTAssertFalse(rewardCalled, "Reward callback should not fire")
        XCTAssertFalse(closedCalled, "Closed callback should not fire")
    }
}

#else

final class BelRewardedInterstitialTests: XCTestCase {
    func testUIKitUnavailable() throws {
        throw XCTSkip("UIKit not available on this platform")
    }
}

#endif
