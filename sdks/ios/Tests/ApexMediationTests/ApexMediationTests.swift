import XCTest
@testable import ApexMediation

final class ApexMediationTests: XCTestCase {

    override func setUp() {
        super.setUp()
        MockURLProtocol.reset()
        // Inject URLSessionConfiguration with MockURLProtocol
        ApexMediation.sessionConfigProvider = {
            let cfg = URLSessionConfiguration.ephemeral
            cfg.protocolClasses = [MockURLProtocol.self]
            return cfg
        }
    }

    func testOfflineStubWhenNoAuctionUrl() {
        let sdk = ApexMediation.shared
        sdk.initialize(InitializationOptions(apiKey: "k", publisherId: "pub", auctionUrl: nil))
        let exp = expectation(description: "stub")
        sdk.requestInterstitial(InterstitialOptions(placementId: "pl")) { result in
            switch result {
            case .success(let res):
                XCTAssertEqual(res.adapter, "stub")
                XCTAssertEqual(res.currency, "USD")
                XCTAssertGreaterThan(res.ecpm, 0)
            default:
                XCTFail("Expected success stub")
            }
            exp.fulfill()
        }
        wait(for: [exp], timeout: 1.0)
    }

    func testSuccess200ParsesWinner() throws {
        let url = URL(string: "https://example.com")!
        let sdk = ApexMediation.shared
        sdk.initialize(InitializationOptions(apiKey: "k", publisherId: "pub", auctionUrl: url))
        // Prepare mock 200 response
        let body: [String: Any] = [
            "winner": [
                "adapter_name": "admob",
                "cpm": 2.5,
                "currency": "USD",
                "creative_id": "cr",
                "ad_markup": "<div>ad</div>"
            ]
        ]
        let data = try JSONSerialization.data(withJSONObject: body)
        MockURLProtocol.response = HTTPURLResponse(url: url.appendingPathComponent("/v1/auction"), statusCode: 200, httpVersion: nil, headerFields: ["Content-Type":"application/json"])!
        MockURLProtocol.responseData = data

        let exp = expectation(description: "ok")
        sdk.requestInterstitial(InterstitialOptions(placementId: "pl")) { result in
            if case .success(let r) = result {
                XCTAssertEqual(r.adapter, "admob")
                XCTAssertEqual(r.currency, "USD")
                XCTAssertEqual(r.ecpm, 2.5, accuracy: 0.0001)
            } else {
                XCTFail("Expected success")
            }
            exp.fulfill()
        }
        wait(for: [exp], timeout: 1.0)
    }

    func testNoFillMapsToNoFill() throws {
        let url = URL(string: "https://example.com")!
        let sdk = ApexMediation.shared
        sdk.initialize(InitializationOptions(apiKey: "k", publisherId: "pub", auctionUrl: url))
        // 200 with no winner
        let body: [String: Any] = ["winner": NSNull()] // or omit winner
        let data = try JSONSerialization.data(withJSONObject: body)
        MockURLProtocol.response = HTTPURLResponse(url: url.appendingPathComponent("/v1/auction"), statusCode: 200, httpVersion: nil, headerFields: ["Content-Type":"application/json"])!
        MockURLProtocol.responseData = data
        let exp = expectation(description: "nofill")
        sdk.requestInterstitial(InterstitialOptions(placementId: "pl")) { result in
            if case .failure(let err) = result {
                XCTAssertEqual(err, .noFill)
            } else {
                XCTFail("Expected no_fill error")
            }
            exp.fulfill()
        }
        wait(for: [exp], timeout: 1.0)
    }

    func testStatusNon200MapsToStatusCode() {
        let url = URL(string: "https://example.com")!
        let sdk = ApexMediation.shared
        sdk.initialize(InitializationOptions(apiKey: "k", publisherId: "pub", auctionUrl: url))
        MockURLProtocol.response = HTTPURLResponse(url: url.appendingPathComponent("/v1/auction"), statusCode: 400, httpVersion: nil, headerFields: nil)!
        MockURLProtocol.responseData = Data("bad".utf8)
        let exp = expectation(description: "status")
        sdk.requestInterstitial(InterstitialOptions(placementId: "pl")) { result in
            if case .failure(let err) = result {
                XCTAssertEqual(err, .status(code: 400))
                XCTAssertEqual(err.description, "status_400")
            } else {
                XCTFail("Expected status_400")
            }
            exp.fulfill()
        }
        wait(for: [exp], timeout: 1.0)
    }

    func testTimeoutMapsToTimeout() {
        let url = URL(string: "https://example.com")!
        let sdk = ApexMediation.shared
        // Use very small timeout and delayed response to trigger timeout
        sdk.initialize(InitializationOptions(apiKey: "k", publisherId: "pub", auctionUrl: url, defaultTimeoutMs: 50))
        MockURLProtocol.response = HTTPURLResponse(url: url.appendingPathComponent("/v1/auction"), statusCode: 200, httpVersion: nil, headerFields: nil)!
        MockURLProtocol.responseData = Data("{}".utf8)
        MockURLProtocol.responseDelay = 0.2 // seconds
        let exp = expectation(description: "timeout")
        sdk.requestInterstitial(InterstitialOptions(placementId: "pl")) { result in
            if case .failure(let err) = result {
                XCTAssertEqual(err, .timeout)
            } else {
                XCTFail("Expected timeout")
            }
            exp.fulfill()
        }
        wait(for: [exp], timeout: 2.0)
    }
}


// Additional tests for taxonomy completeness
extension ApexMediationTests {
    func testStatus204MapsToNoFill() {
        let url = URL(string: "https://example.com")!
        let sdk = ApexMediation.shared
        sdk.initialize(InitializationOptions(apiKey: "k", publisherId: "pub", auctionUrl: url))
        // 204 No Content → no_fill
        MockURLProtocol.response = HTTPURLResponse(url: url.appendingPathComponent("/v1/auction"), statusCode: 204, httpVersion: nil, headerFields: nil)!
        MockURLProtocol.responseData = Data()
        let exp = expectation(description: "204 no_fill")
        sdk.requestInterstitial(InterstitialOptions(placementId: "pl")) { result in
            if case .failure(let err) = result {
                XCTAssertEqual(err, .noFill)
            } else {
                XCTFail("Expected no_fill for 204")
            }
            exp.fulfill()
        }
        wait(for: [exp], timeout: 1.0)
    }

    func testMalformedJsonMapsToError() {
        let url = URL(string: "https://example.com")!
        let sdk = ApexMediation.shared
        sdk.initialize(InitializationOptions(apiKey: "k", publisherId: "pub", auctionUrl: url))
        // 200 OK with malformed JSON
        MockURLProtocol.response = HTTPURLResponse(url: url.appendingPathComponent("/v1/auction"), statusCode: 200, httpVersion: nil, headerFields: nil)!
        MockURLProtocol.responseData = Data("{not-json".utf8)
        let exp = expectation(description: "malformed")
        sdk.requestInterstitial(InterstitialOptions(placementId: "pl")) { result in
            if case .failure(let err) = result {
                XCTAssertEqual(err, .other(reason: "error"))
            } else {
                XCTFail("Expected error for malformed JSON")
            }
            exp.fulfill()
        }
        wait(for: [exp], timeout: 1.0)
    }
}
