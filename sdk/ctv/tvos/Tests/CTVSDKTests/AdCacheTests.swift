import XCTest
@testable import CTVSDK

final class AdCacheTests: XCTestCase {
    private var cache: AdCache!

    override func setUp() {
        super.setUp()
        cache = AdCache()
    }

    func testTakeRemovesEntry() {
        let win = makeWin(bidId: "take-test")
        cache.store(win: win, for: "placement")

        XCTAssertNotNil(cache.peek(placementId: "placement"))
        let taken = cache.take(placementId: "placement")
        XCTAssertEqual(taken?.bidId, "take-test")
        XCTAssertNil(cache.peek(placementId: "placement"))
    }

    func testPeekKeepsEntryAvailable() {
        let win = makeWin(bidId: "peek-test")
        cache.store(win: win, for: "placement")

        let firstPeek = cache.peek(placementId: "placement")
        XCTAssertEqual(firstPeek?.bidId, "peek-test")

        let taken = cache.take(placementId: "placement")
        XCTAssertEqual(taken?.bidId, "peek-test")
    }

    func testExpiredEntriesArePurged() {
        cache.store(win: makeWin(ttlSeconds: 0), for: "placement")

        XCTAssertNil(cache.peek(placementId: "placement"))
        XCTAssertNil(cache.take(placementId: "placement"))
    }

    func testStoreReplacesExistingEntry() {
        cache.store(win: makeWin(bidId: "first"), for: "placement")
        cache.store(win: makeWin(bidId: "second"), for: "placement")

        let peeked = cache.peek(placementId: "placement")
        XCTAssertEqual(peeked?.bidId, "second")
        XCTAssertEqual(cache.take(placementId: "placement")?.bidId, "second")
    }

    private func makeWin(bidId: String = UUID().uuidString, ttlSeconds: Int = 30) -> AuctionWin {
        let tracking = AuctionWin.Tracking(
            impression: "https://example.com/imp",
            click: "https://example.com/click",
            start: nil,
            firstQuartile: nil,
            midpoint: nil,
            thirdQuartile: nil,
            complete: nil,
            pause: nil,
            resume: nil,
            mute: nil,
            unmute: nil,
            close: nil
        )
        return AuctionWin(
            requestId: "request",
            bidId: bidId,
            adapter: "mock",
            cpm: 1.0,
            currency: "USD",
            ttlSeconds: ttlSeconds,
            creativeUrl: "https://example.com/asset",
            tracking: tracking
        )
    }
}
