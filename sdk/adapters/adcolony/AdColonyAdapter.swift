import Foundation

@objc(RAMAdColonyAdapter)
public class AdColonyAdapter: NSObject, RAMAdNetworkAdapter {
    public let networkName = "adcolony"
    public let version = "1.0.0"
    public let minSDKVersion = "1.0.0"
    
    private var isInitialized = false
    
    public func initialize(with config: [String: Any], completion: @escaping (Error?) -> Void) {
        if isInitialized {
            completion(nil)
            return
        }
        
        // TODO: Initialize AdColony SDK
        // AdColony.configure(withAppID: appId, zoneIDs: zones, options: options) { ... }
        isInitialized = true
        completion(nil)
    }
}
