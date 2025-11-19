import Foundation

@objc(RAMInMobiAdapter)
public class InMobiAdapter: NSObject, RAMAdNetworkAdapter {
    public let networkName = "inmobi"
    public let version = "1.0.0"
    public let minSDKVersion = "1.0.0"
    
    private var isInitialized = false
    
    public func initialize(with config: [String: Any], completion: @escaping (Error?) -> Void) {
        if isInitialized {
            completion(nil)
            return
        }
        
        // TODO: Initialize InMobi SDK
        // IMSdk.initWithAccountID(accountId, consentDictionary: consent)
        isInitialized = true
        completion(nil)
    }
}
