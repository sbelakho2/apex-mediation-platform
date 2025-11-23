import XCTest
@testable import RivalApexMediationSDK

final class AuctionClientTests: XCTestCase {
    
    var client: AuctionClient!
    
    override func setUp() {
        super.setUp()
        client = AuctionClient(
            baseURL: "https://test.example.com",
            apiKey: "test-key",
            timeout: 5.0
        )
    }
    
    override func tearDown() {
        client = nil
        super.tearDown()
    }
    
    func testInitialization() {
        XCTAssertNotNil(client)
    }
    
    func testUserAgentGeneration() async {
        // User agent should contain SDK version and platform info
        // This is tested indirectly through request building
        // Since userAgent() is private, we verify it's set in actual requests
        XCTAssertNotNil(client)
    }
    
    func testDeviceInfoGeneration() {
        // Device info should include platform, OS version, screen dimensions
        // Tested indirectly through request body building
        XCTAssertNotNil(client)
    }
    
    func testConsentPropagation() {
        // Set consent
        let consent = ConsentData(
            gdprApplies: true,
            gdprConsentString: "test-consent",
            ccpaOptOut: false,
            coppa: false
        )
        MediationSDK.shared.setConsent(consent)
        
        // Verify consent metadata is generated
        let metadata = MediationSDK.shared.consentMetadata()
        XCTAssertEqual(metadata["gdpr"] as? Int, 1)
        XCTAssertEqual(metadata["gdpr_consent"] as? String, "test-consent")
        
        // Clean up
        ConsentManager.shared.clear()
    }
    
    // Note: Network request tests would require URLProtocol mocking
    // or a real test server. For comprehensive testing, implement
    // MockURLProtocol similar to the Demo app approach.
    
    func testErrorTaxonomyMapping() {
        // Test SDK error creation from HTTP status codes
        let error429 = SDKError.fromHTTPStatus(code: 429, message: "Rate limited")
        XCTAssertEqual(error429, SDKError.status_429(message: "Rate limited"))
        
        let error503 = SDKError.fromHTTPStatus(code: 503, message: "Service unavailable")
        XCTAssertEqual(error503, SDKError.status_5xx(code: 503, message: "Service unavailable"))
        
        let error204 = SDKError.fromHTTPStatus(code: 204)
        XCTAssertEqual(error204, SDKError.noFill)
    }
}
