import Foundation

@objc(RAMMintegralAdapter)
public class MintegralAdapter: NSObject, RAMAdNetworkAdapter {
    public let networkName = "mintegral"
    public let version = "1.0.0"
    public let minSDKVersion = "1.0.0"
    
    private var isInitialized = false
    
    public func initialize(with config: [String: Any], completion: @escaping (Error?) -> Void) {
        if isInitialized {
            completion(nil)
            return
        }
        
        // TODO: Initialize Mintegral SDK
        // MTGSDK.sharedInstance().setAppID(appId, apiKey: apiKey)
        isInitialized = true
        completion(nil)
    }
}
