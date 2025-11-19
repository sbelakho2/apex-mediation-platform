import Foundation

@objc(RAMFyberAdapter)
public class FyberAdapter: NSObject, RAMAdNetworkAdapter {
    public let networkName = "fyber"
    public let version = "1.0.0"
    public let minSDKVersion = "1.0.0"
    
    private var isInitialized = false
    
    public func initialize(with config: [String: Any], completion: @escaping (Error?) -> Void) {
        if isInitialized {
            completion(nil)
            return
        }
        
        // TODO: Initialize Fyber SDK
        // FairBid.start(withAppId: appId)
        isInitialized = true
        completion(nil)
    }
}
