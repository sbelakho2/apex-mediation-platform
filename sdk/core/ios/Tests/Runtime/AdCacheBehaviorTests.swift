import XCTest
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif
@testable import RivalApexMediationSDK

final class AdCacheBehaviorTests: XCTestCase {
    private var sdk: MediationSDK!

    override func setUp() async throws {
    #if os(Linux)
        throw XCTSkip("Ad cache tests require Apple's networking stack")
    #else
        sdk = MediationSDK.shared
        NetworkTestHooks.registerMockProtocol(MockURLProtocolFixture.self)
        MockURLProtocolFixture.reset()
    #endif
    }

    override func tearDown() {
    #if os(Linux)
        return
    #else
        MockURLProtocolFixture.reset()
        NetworkTestHooks.resetMockProtocols()
        sdk?.shutdown()
    #endif
        super.tearDown()
    }

    func testClaimingAdConsumesCacheEntry() async throws {
        MockURLProtocolFixture.scenario = .success
        MockURLProtocolFixture.enqueueAdResponse(.init(adId: "ios-cache-first", placementId: "interstitial_main", expiresIn: 120))

        let config = testConfig()
        try await sdk.initialize(appId: "ios-cache-app", configuration: config)

        let loaded = try await sdk.loadAd(placementId: "interstitial_main")
        XCTAssertEqual("ios-cache-first", loaded?.adId)
        XCTAssertTrue(sdk.isAdReady(placementId: "interstitial_main"))

        let peeked = await sdk.peekAd(placementId: "interstitial_main")
        XCTAssertEqual("ios-cache-first", peeked?.adId)

        let claimed = await sdk.claimAd(placementId: "interstitial_main")
        XCTAssertEqual("ios-cache-first", claimed?.adId)
        XCTAssertFalse(sdk.isAdReady(placementId: "interstitial_main"))
    }

    func testExpiredAdIsPrunedBeforeClaim() async throws {
        MockURLProtocolFixture.scenario = .success
        MockURLProtocolFixture.enqueueAdResponse(.init(adId: "ios-cache-exp", placementId: "interstitial_main", expiresIn: 0.5))

        let config = testConfig()
        try await sdk.initialize(appId: "ios-cache-exp-app", configuration: config)

        _ = try await sdk.loadAd(placementId: "interstitial_main")
        XCTAssertTrue(sdk.isAdReady(placementId: "interstitial_main"))

        try await Task.sleep(nanoseconds: 1_200_000_000) // Wait > TTL so prune sees expiration

        let claimed = await sdk.claimAd(placementId: "interstitial_main")
        XCTAssertNil(claimed, "Expired ads should not be returned from claimAd")
        XCTAssertFalse(sdk.isAdReady(placementId: "interstitial_main"))
    }

    func testSequentialLoadsQueueMultipleAds() async throws {
        MockURLProtocolFixture.scenario = .success
        MockURLProtocolFixture.enqueueAdResponse(.init(adId: "ios-cache-one", placementId: "interstitial_main", expiresIn: 300))
        MockURLProtocolFixture.enqueueAdResponse(.init(adId: "ios-cache-two", placementId: "interstitial_main", expiresIn: 300))

        let config = testConfig()
        try await sdk.initialize(appId: "ios-cache-queue", configuration: config)

        _ = try await sdk.loadAd(placementId: "interstitial_main")
        _ = try await sdk.loadAd(placementId: "interstitial_main")

        let first = await sdk.claimAd(placementId: "interstitial_main")
        XCTAssertEqual("ios-cache-one", first?.adId)
        XCTAssertTrue(sdk.isAdReady(placementId: "interstitial_main"), "Second ad should remain cached after first claim")

        let second = await sdk.claimAd(placementId: "interstitial_main")
        XCTAssertEqual("ios-cache-two", second?.adId)
        XCTAssertFalse(sdk.isAdReady(placementId: "interstitial_main"))
    }

    private func testConfig() -> SDKConfig {
        SDKConfig(
            appId: "test_app",
            configEndpoint: "https://mock-config.test/v1/config",
            auctionEndpoint: "https://mock-auction.test/v1/auction",
            telemetryEnabled: false,
            logLevel: .error,
            testMode: true,
            configSignaturePublicKey: nil
        )
    }
}
