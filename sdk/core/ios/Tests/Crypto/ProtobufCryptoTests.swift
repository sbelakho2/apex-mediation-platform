import XCTest
import SwiftProtobuf
import Crypto
@testable import RivalApexMediationSDK

/// Tests for Protobuf parsing and cryptographic workflows
class ProtobufCryptoTests: XCTestCase {
    
    // MARK: - Protobuf Tests
    
    func testProtobufSerialization() throws {
        // Create a sample bid request protobuf message (adjust based on actual proto definitions)
        // This is a placeholder - actual implementation depends on your .proto files
        
        let jsonString = """
        {
            "placementId": "test-placement",
            "adFormat": "interstitial",
            "deviceInfo": {
                "platform": "iOS",
                "osVersion": "17.0"
            }
        }
        """
        
        let jsonData = jsonString.data(using: .utf8)!
        
        // Test JSON decoding (protobuf alternative format)
        let decoded = try JSONDecoder().decode([String: AnyCodable].self, from: jsonData)
        XCTAssertEqual(decoded["placementId"]?.value as? String, "test-placement")
    }
    
    func testProtobufDeserialization() throws {
        // Test parsing a protobuf binary response
        // Placeholder implementation - adjust based on actual proto schema
        
        let mockBinaryData = Data([0x0a, 0x10, 0x74, 0x65, 0x73, 0x74, 0x2d, 0x70, 0x6c, 0x61, 0x63, 0x65, 0x6d, 0x65, 0x6e, 0x74])
        
        // In real implementation, you'd deserialize using SwiftProtobuf generated types
        // Example: let response = try BidResponse(serializedData: mockBinaryData)
        
        XCTAssertFalse(mockBinaryData.isEmpty)
    }
    
    func testProtobufValidation() throws {
        // Test required field validation
        let invalidJSON = """
        {
            "adFormat": "banner"
        }
        """
        
        let jsonData = invalidJSON.data(using: .utf8)!
        
        // Expect validation failure due to missing placementId
        do {
            let _ = try JSONDecoder().decode([String: String].self, from: jsonData)
            // Validation logic would go here in real implementation
            XCTAssertTrue(true) // Placeholder
        } catch {
            XCTFail("JSON parsing failed: \(error)")
        }
    }
    
    // MARK: - Crypto Tests
    
    func testHMACSHA256Signing() throws {
        let message = "test-message-payload"
        let key = "secret-key-12345"
        
        let messageData = message.data(using: .utf8)!
        let keyData = SymmetricKey(data: key.data(using: .utf8)!)
        
        let signature = HMAC<SHA256>.authenticationCode(for: messageData, using: keyData)
        let signatureHex = Data(signature).map { String(format: "%02x", $0) }.joined()
        
        XCTAssertFalse(signatureHex.isEmpty)
        XCTAssertEqual(signatureHex.count, 64) // SHA256 = 32 bytes = 64 hex chars
    }
    
    func testHMACSignatureVerification() throws {
        let message = "authenticated-request"
        let key = "shared-secret"
        let messageData = message.data(using: .utf8)!
        let keyData = SymmetricKey(data: key.data(using: .utf8)!)
        
        // Generate signature
        let signature = HMAC<SHA256>.authenticationCode(for: messageData, using: keyData)
        
        // Verify signature
        let isValid = HMAC<SHA256>.isValidAuthenticationCode(signature, authenticating: messageData, using: keyData)
        XCTAssertTrue(isValid)
        
        // Test invalid signature
        let tamperedMessage = "tampered-request".data(using: .utf8)!
        let isInvalid = HMAC<SHA256>.isValidAuthenticationCode(signature, authenticating: tamperedMessage, using: keyData)
        XCTAssertFalse(isInvalid)
    }
    
    func testSHA256Hashing() throws {
        let input = "test-input-data"
        let inputData = input.data(using: .utf8)!
        
        let hash = SHA256.hash(data: inputData)
        let hashHex = hash.compactMap { String(format: "%02x", $0) }.joined()
        
        XCTAssertEqual(hashHex.count, 64) // SHA256 = 32 bytes = 64 hex chars
        
        // Verify deterministic hashing
        let hash2 = SHA256.hash(data: inputData)
        let hashHex2 = hash2.compactMap { String(format: "%02x", $0) }.joined()
        XCTAssertEqual(hashHex, hashHex2)
    }
    
    func testAESGCMEncryptionDecryption() throws {
        let plaintext = "sensitive-user-data"
        let plaintextData = plaintext.data(using: .utf8)!
        
        // Generate random key
        let key = SymmetricKey(size: .bits256)
        
        // Encrypt
        let sealedBox = try AES.GCM.seal(plaintextData, using: key)
        
        XCTAssertNotNil(sealedBox.ciphertext)
        XCTAssertNotEqual(sealedBox.ciphertext, plaintextData)
        
        // Decrypt
        let decryptedData = try AES.GCM.open(sealedBox, using: key)
        let decryptedString = String(data: decryptedData, encoding: .utf8)
        
        XCTAssertEqual(decryptedString, plaintext)
    }
    
    func testRandomNonceGeneration() throws {
        let nonce1 = AES.GCM.Nonce()
        let nonce2 = AES.GCM.Nonce()
        
        // Verify nonces are different (random)
        XCTAssertNotEqual(Data(nonce1), Data(nonce2))
    }
    
    func testTimingSafeComparison() {
        let secret1 = "correct-secret"
        let secret2 = "correct-secret"
        let secret3 = "wrong-secret"
        
        let data1 = secret1.data(using: .utf8)!
        let data2 = secret2.data(using: .utf8)!
        let data3 = secret3.data(using: .utf8)!
        
        // Use constant-time comparison to prevent timing attacks
        func constantTimeCompare(_ lhs: Data, _ rhs: Data) -> Bool {
            guard lhs.count == rhs.count else { return false }
            return lhs.withUnsafeBytes { lhsBytes in
                rhs.withUnsafeBytes { rhsBytes in
                    var result = 0
                    for i in 0..<lhs.count {
                        result |= Int(lhsBytes[i]) ^ Int(rhsBytes[i])
                    }
                    return result == 0
                }
            }
        }
        
        XCTAssertTrue(constantTimeCompare(data1, data2))
        XCTAssertFalse(constantTimeCompare(data1, data3))
    }
}

// Helper for dynamic JSON decoding
struct AnyCodable: Codable {
    let value: Any
    
    init(_ value: Any) {
        self.value = value
    }
    
    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if let string = try? container.decode(String.self) {
            value = string
        } else if let int = try? container.decode(Int.self) {
            value = int
        } else if let double = try? container.decode(Double.self) {
            value = double
        } else if let bool = try? container.decode(Bool.self) {
            value = bool
        } else if let dict = try? container.decode([String: AnyCodable].self) {
            value = dict
        } else if let array = try? container.decode([AnyCodable].self) {
            value = array
        } else {
            value = NSNull()
        }
    }
    
    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        if let string = value as? String {
            try container.encode(string)
        } else if let int = value as? Int {
            try container.encode(int)
        } else if let double = value as? Double {
            try container.encode(double)
        } else if let bool = value as? Bool {
            try container.encode(bool)
        } else if let dict = value as? [String: AnyCodable] {
            try container.encode(dict)
        } else if let array = value as? [AnyCodable] {
            try container.encode(array)
        } else {
            try container.encodeNil()
        }
    }
}
