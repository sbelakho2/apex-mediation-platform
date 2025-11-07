import XCTest
@testable import ApexMediation

final class TaxonomyAndMainQueueTests: XCTestCase {
    override func setUp() {
        super.setUp()
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [MockURLProtocol.self]
        ApexMediation.sessionConfigProvider = { config }
        MockURLProtocol.requestHandler = nil
    }

    override func tearDown() {
        MockURLProtocol.requestHandler = nil
        super.tearDown()
    }

    func testHTTP429MapsToStatus429() throws {
        let exp = expectation(description: "429 mapped")
        MockURLProtocol.requestHandler = { request in
            let resp = HTTPURLResponse(url: request.url!, statusCode: 429, httpVersion: nil, headerFields: nil)!
            return (resp, Data())
        }
        let sdk = ApexMediation()
        let result = sdk.requestInterstitial(placementId: "pl1", timeoutMs: 200)
        switch result {
        case .failure(let err):
            // We accept either a normalized reason in the error description or a domain/code path depending on implementation
            XCTAssertTrue(err.localizedDescription.contains("status_429") || err.localizedDescription.contains("429"))
            exp.fulfill()
        case .success:
            XCTFail("Expected failure for 429")
        }
        wait(for: [exp], timeout: 1.0)
    }

    func testHTTP5xxRetryOrErrorPath() throws {
        let exp = expectation(description: "5xx handled")
        // Return a single 500. The client may retry depending on implementation;
        // for this SDK, we only assert that an error surfaces with status_5xx taxonomy.
        MockURLProtocol.requestHandler = { request in
            let resp = HTTPURLResponse(url: request.url!, statusCode: 500, httpVersion: nil, headerFields: nil)!
            return (resp, Data())
        }
        let sdk = ApexMediation()
        let result = sdk.requestInterstitial(placementId: "pl1", timeoutMs: 200)
        switch result {
        case .failure(let err):
            let msg = err.localizedDescription.lowercased()
            XCTAssertTrue(msg.contains("status_500") || msg.contains("status_5"), "expected status_5xx taxonomy, got: \(msg)")
            exp.fulfill()
        case .success:
            XCTFail("Expected failure for 500")
        }
        wait(for: [exp], timeout: 1.0)
    }

    func testBelInterstitialLoadCompletionOnMainQueue() throws {
        // Arrange a 204 no content to trigger no_fill; completion should still be invoked on main queue
        let exp = expectation(description: "completion on main")
        MockURLProtocol.requestHandler = { request in
            let resp = HTTPURLResponse(url: request.url!, statusCode: 204, httpVersion: nil, headerFields: nil)!
            return (resp, Data())
        }
        // Call load; completion must be on main thread due to @MainActor usage in facade
        BelInterstitial.load(placementId: "pl_main") { result in
            XCTAssertTrue(Thread.isMainThread, "Completion should be on main queue")
            exp.fulfill()
        }
        wait(for: [exp], timeout: 1.0)
    }
}
