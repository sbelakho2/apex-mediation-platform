import XCTest
import CryptoKit

@testable import RivalApexMediationSDK

final class SignatureVerifierTests: XCTestCase {
    func testVerifySignatureWithGeneratedKey() throws {
        let keyPair = Curve25519.Signing.PrivateKey()
        let publicKeyHex = keyPair.publicKey.rawRepresentation.hexString
        let verifier = SignatureVerifier(testMode: false, productionPublicKey: publicKeyHex)

        let message = "config_123"
        let signatureData = try keyPair.signature(for: Data(message.utf8))
        let signatureBase64 = signatureData.base64EncodedString()

        XCTAssertTrue(try verifier.verifySignature(message: message, signatureBase64: signatureBase64))
    }

    func testVerifySignatureRejectsTampering() throws {
        let keyPair = Curve25519.Signing.PrivateKey()
        let publicKeyHex = keyPair.publicKey.rawRepresentation.hexString
        let verifier = SignatureVerifier(testMode: false, productionPublicKey: publicKeyHex)

        let message = "config_123"
        let signatureBase64 = try keyPair.signature(for: Data(message.utf8)).base64EncodedString()

        XCTAssertThrowsError(
            try verifier.verifySignature(message: message + "_tampered", signatureBase64: signatureBase64)
        ) { error in
            XCTAssertEqual(error as? SignatureError, .verificationFailed)
        }
    }

    func testVerifySignatureRequiresPublicKeyInProduction() {
        let verifier = SignatureVerifier(testMode: false, productionPublicKey: nil)

        XCTAssertThrowsError(try verifier.verifySignature(message: "msg", signatureBase64: "AAAA")) { error in
            XCTAssertEqual(error as? SignatureError, .noPublicKey)
        }
    }

    func testVerifyEd25519RawMatchesHighLevelAPI() throws {
        let keyPair = Curve25519.Signing.PrivateKey()
        let publicKeyHex = keyPair.publicKey.rawRepresentation.hexString
        let verifier = SignatureVerifier(testMode: false, productionPublicKey: publicKeyHex)

        let payload = Data("payload".utf8)
        let signature = try keyPair.signature(for: payload)

        XCTAssertTrue(try verifier.verifyEd25519Raw(message: payload, signature: signature, publicKeyHex: publicKeyHex))
    }

    func testCanonicalMessageIsDeterministic() {
        let generated = SignatureVerifier.createCanonicalMessage(configId: "config_1", version: 4, timestamp: 1234)
        let regenerated = SignatureVerifier.createCanonicalMessage(configId: "config_1", version: 4, timestamp: 1234)

        XCTAssertEqual(generated, regenerated)
        XCTAssertEqual(generated, "{\"config_id\":\"config_1\",\"timestamp\":1234,\"version\":4}")
    }

    func testMalformedBase64Throws() {
        let verifier = SignatureVerifier(testMode: true, productionPublicKey: nil)

        XCTAssertThrowsError(try verifier.verifySignature(message: "msg", signatureBase64: "!not_base64!")) { error in
            XCTAssertEqual(error as? SignatureError, .malformedSignature("Invalid Base64 encoding"))
        }
    }
}

private extension Data {
    var hexString: String {
        map { String(format: "%02x", $0) }.joined()
    }
}
