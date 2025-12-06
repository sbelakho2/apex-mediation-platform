import Foundation

/// User consent data for privacy regulations
public struct ConsentData: Codable, Equatable, Sendable {
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
    private let storage: UserDefaults
    private var currentConsent: ConsentData
    private let lock = NSLock()
    
    init(storage: UserDefaults = .standard) {
        self.storage = storage
        if let data = storage.data(forKey: userDefaultsKey),
           let decoded = try? JSONDecoder().decode(ConsentData.self, from: data) {
            currentConsent = decoded
        } else {
            currentConsent = ConsentData()
        }
    }
    
    /// Set user consent and persist
    public func setConsent(_ consent: ConsentData) {
        lock.lock()
        currentConsent = consent
        persistLocked(consent)
        lock.unlock()
    }
    
    /// Get current consent
    public func getConsent() -> ConsentData {
        lock.lock()
        let consent = currentConsent
        lock.unlock()
        return consent
    }
    
    /// Get redacted consent info for debug panel (no PII)
    public func getRedactedConsentInfo() -> [String: Any] {
        let consent = getConsent()
        return [
            "gdprApplies": consent.gdprApplies ?? false,
            "gdprConsentString": consent.gdprConsentString != nil ? "<redacted>" : "none",
            "ccpaOptOut": consent.ccpaOptOut,
            "coppa": consent.coppa
        ]
    }
    
    /// Check if personalized ads are allowed based on consent
    public func canShowPersonalizedAds() -> Bool {
        // COPPA users cannot see personalized ads
        let consent = getConsent()
        if consent.coppa {
            return false
        }
        
        // CCPA opt-out means no personalized ads
        if consent.ccpaOptOut {
            return false
        }
        
        // GDPR: check if consent string indicates consent
        if let gdprApplies = consent.gdprApplies, gdprApplies {
            // If GDPR applies but no consent string, assume no consent
            if consent.gdprConsentString == nil || consent.gdprConsentString?.isEmpty == true {
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
        
        let consent = getConsent()

        if let gdprApplies = consent.gdprApplies {
            metadata["gdpr"] = gdprApplies ? 1 : 0
        }
        
        if let consentString = consent.gdprConsentString, !consentString.isEmpty {
            metadata["gdpr_consent"] = consentString
        }
        
        if consent.ccpaOptOut {
            metadata["us_privacy"] = "1YNN" // IAB CCPA string: do not sell
        } else {
            metadata["us_privacy"] = "1YYN" // Allow sale
        }
        
        if consent.coppa {
            metadata["coppa"] = 1
        }
        
        return metadata
    }
    
    /// Convert consent to adapter-facing state payload
    public func toAdapterConsentPayload(attStatusProvider: () -> ATTStatus = { .notDetermined }) -> [String: Any] {
        let consent = getConsent()
        let consentState = ConsentState(
            iabTCFv2: consent.gdprConsentString,
            iabUSGPP: consent.ccpaOptOut ? "1YNN" : "1YYN",
            coppa: consent.coppa,
            attStatus: attStatusProvider(),
            limitAdTracking: !canShowPersonalizedAds()
        )
        var payload: [String: Any] = [
            "coppa": consentState.coppa,
            "att_status": consentState.attStatus.rawValue,
            "limit_ad_tracking": consentState.limitAdTracking
        ]
        if let tcf = consentState.iabTCFv2, !tcf.isEmpty {
            payload["iab_tcf_v2"] = tcf
        }
        if let gpp = consentState.iabUSGPP, !gpp.isEmpty {
            payload["iab_us_gpp"] = gpp
        }
        return payload
    }
    
    private func persistLocked(_ consent: ConsentData) {
        if let encoded = try? JSONEncoder().encode(consent) {
            storage.set(encoded, forKey: userDefaultsKey)
        }
    }
    
    /// Clear all consent data (for testing)
    public func clear() {
        lock.lock()
        currentConsent = ConsentData()
        storage.removeObject(forKey: userDefaultsKey)
        lock.unlock()
    }
}

    extension ConsentManager: @unchecked Sendable {}
