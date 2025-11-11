import Foundation

/// User consent data for privacy regulations
public struct ConsentData: Codable, Equatable {
    /// Whether GDPR applies to this user
    public var gdprApplies: Bool?
    
    /// IAB TCF consent string (if GDPR applies)
    public var gdprConsentString: String?
    
    /// CCPA "Do Not Sell" opt-out flag
    public var ccpaOptOut: Bool
    
    /// COPPA (Children's Online Privacy Protection Act) flag
    public var coppa: Bool
    
    public init(
        gdprApplies: Bool? = nil,
        gdprConsentString: String? = nil,
        ccpaOptOut: Bool = false,
        coppa: Bool = false
    ) {
        self.gdprApplies = gdprApplies
        self.gdprConsentString = gdprConsentString
        self.ccpaOptOut = ccpaOptOut
        self.coppa = coppa
    }
}

/// Manages user consent for privacy compliance
public final class ConsentManager {
    public static let shared = ConsentManager()
    
    private let userDefaultsKey = "apex_consent_data"
    private var currentConsent: ConsentData
    
    private init() {
        // Load from persistent storage
        if let data = UserDefaults.standard.data(forKey: userDefaultsKey),
           let decoded = try? JSONDecoder().decode(ConsentData.self, from: data) {
            currentConsent = decoded
        } else {
            // Default: no consent given
            currentConsent = ConsentData()
        }
    }
    
    /// Set user consent and persist
    public func setConsent(_ consent: ConsentData) {
        currentConsent = consent
        persist()
    }
    
    /// Get current consent
    public func getConsent() -> ConsentData {
        return currentConsent
    }
    
    /// Get redacted consent info for debug panel (no PII)
    public func getRedactedConsentInfo() -> [String: Any] {
        return [
            "gdprApplies": currentConsent.gdprApplies ?? false,
            "gdprConsentString": currentConsent.gdprConsentString != nil ? "<redacted>" : "none",
            "ccpaOptOut": currentConsent.ccpaOptOut,
            "coppa": currentConsent.coppa
        ]
    }
    
    /// Check if personalized ads are allowed based on consent
    public func canShowPersonalizedAds() -> Bool {
        // COPPA users cannot see personalized ads
        if currentConsent.coppa {
            return false
        }
        
        // CCPA opt-out means no personalized ads
        if currentConsent.ccpaOptOut {
            return false
        }
        
        // GDPR: check if consent string indicates consent
        if let gdprApplies = currentConsent.gdprApplies, gdprApplies {
            // If GDPR applies but no consent string, assume no consent
            if currentConsent.gdprConsentString == nil || currentConsent.gdprConsentString?.isEmpty == true {
                return false
            }
            // TODO: Parse IAB TCF string for specific purposes when needed
            // For now, presence of consent string implies consent
            return true
        }
        
        // Default: allow personalized ads
        return true
    }
    
    /// Convert consent to metadata for ad requests
    public func toAdRequestMetadata() -> [String: Any] {
        var metadata: [String: Any] = [:]
        
        if let gdprApplies = currentConsent.gdprApplies {
            metadata["gdpr"] = gdprApplies ? 1 : 0
        }
        
        if let consentString = currentConsent.gdprConsentString, !consentString.isEmpty {
            metadata["gdpr_consent"] = consentString
        }
        
        if currentConsent.ccpaOptOut {
            metadata["us_privacy"] = "1YNN" // IAB CCPA string: do not sell
        } else {
            metadata["us_privacy"] = "1YYN" // Allow sale
        }
        
        if currentConsent.coppa {
            metadata["coppa"] = 1
        }
        
        return metadata
    }
    
    private func persist() {
        if let encoded = try? JSONEncoder().encode(currentConsent) {
            UserDefaults.standard.set(encoded, forKey: userDefaultsKey)
        }
    }
    
    /// Clear all consent data (for testing)
    public func clear() {
        currentConsent = ConsentData()
        UserDefaults.standard.removeObject(forKey: userDefaultsKey)
    }
}
