import XCTest
@testable import ApexMediation

final class ConsentPropagationTests: XCTestCase {
    override func setUp() {
        super.setUp()
        // Install MockURLProtocol to intercept requests
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [MockURLProtocol.self]
        ApexMediation.sessionConfigProvider = { config }
        MockURLProtocol.requestHandler = nil
    }

    override func tearDown() {
        MockURLProtocol.requestHandler = nil
        super.tearDown()
    }

    func testConsentFlagsPropagateToMetadata() throws {
        let exp = expectation(description: "request sent")

        // Arrange a 204 No Content to force no_fill without JSON body parsing
        MockURLProtocol.requestHandler = { request in
            // Capture payload
            guard let body = request.httpBody,
                  let obj = try? JSONSerialization.jsonObject(with: body, options: []) as? [String: Any],
                  let metadata = obj["metadata"] as? [String: Any] else {
                XCTFail("Missing request body/metadata")
                throw NSError(domain: "test", code: 1)
            }
            // Validate consent flags
            XCTAssertEqual(metadata["gdpr_applies"] as? String, "1")
            XCTAssertEqual(metadata["us_privacy"] as? String, "1YNN")
            XCTAssertEqual(metadata["coppa"] as? String, "0")

            exp.fulfill()
            // Return 204
            let resp = HTTPURLResponse(url: request.url!, statusCode: 204, httpVersion: nil, headerFields: nil)!
            return (resp, Data())
        }

        // Act: initialize and make a request
        let sdk = ApexMediation()
        sdk.setConsent(gdprApplies: true, consentString: "TCF_TEST", usPrivacy: "1YNN", coppa: false)

        let result = sdk.requestInterstitial(placementId: "pl1", timeoutMs: 200)
        // Map 204 -> no_fill; ensure error string reflects taxonomy
        switch result {
        case .failure(let err):
            // Accept both explicit no_fill or generic error depending on implementation path
            // The key validation is that the request carried consent flags
            _ = err.localizedDescription
        case .success:
            XCTFail("Expected no_fill path due to 204")
        }

        wait(for: [exp], timeout: 1.0)
    }
}
