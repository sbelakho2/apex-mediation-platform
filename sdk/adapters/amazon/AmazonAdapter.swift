import Foundation

@objc(RAMAmazonAdapter)
public class AmazonAdapter: NSObject, RAMAdNetworkAdapter {
    public let networkName = "amazon"
    public let version = "1.0.0"
    public let minSDKVersion = "1.0.0"
    
    private var isInitialized = false
    
    public func initialize(with config: [String: Any], completion: @escaping (Error?) -> Void) {
        if isInitialized {
            completion(nil)
            return
        }
        
        // TODO: Initialize Amazon SDK
        // DTBAds.sharedInstance().setAppKey(appKey)
        isInitialized = true
        completion(nil)
    }
}
