import XCTest
@testable import RivalApexMediationSDK

final class ConfigManagerSigningTests: XCTestCase {
    func testFailsClosedWhenVerifierMissingInProd() async {
        let cfg = SDKConfig(
            appId: "app",
            configEndpoint: "https://example.invalid",
            auctionEndpoint: "https://example.invalid",
            telemetryEnabled: true,
            logLevel: .info,
            testMode: false,
            configSignaturePublicKey: nil
        )

        let manager = ConfigManager(config: cfg, signatureVerifier: nil)

        do {
            _ = try await manager.loadConfig()
            XCTFail("expected missingSignature")
        } catch let cfgError as ConfigError {
            if case .missingSignature = cfgError {
                return
            }
            XCTFail("expected missingSignature, got \(cfgError)")
        } catch {
            XCTFail("expected ConfigError, got \(error)")
        }
    }
}
