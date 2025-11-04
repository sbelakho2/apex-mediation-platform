import XCTest
@testable import ApexMediation

final class ApexMediationTests: XCTestCase {
    func testInitializationFailsWithEmptyApiKey() {
        let expectation = expectation(description: "Empty API key should fail")

        ApexMediation.shared.initialize(apiKey: "") { result in
            switch result {
            case .failure(let error):
                XCTAssertEqual(error as? SDKError, .invalidApiKey)
            case .success:
                XCTFail("Initialization should have failed")
            }
            expectation.fulfill()
        }

        waitForExpectations(timeout: 1.0)
    }
}
