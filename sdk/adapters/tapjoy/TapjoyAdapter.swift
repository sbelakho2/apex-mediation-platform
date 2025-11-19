import Foundation

@objc(RAMTapjoyAdapter)
public class TapjoyAdapter: NSObject, RAMAdNetworkAdapter {
    public let networkName = "tapjoy"
    public let version = "1.0.0"
    public let minSDKVersion = "1.0.0"
    
    private var isInitialized = false
    
    public func initialize(with config: [String: Any], completion: @escaping (Error?) -> Void) {
        if isInitialized {
            completion(nil)
            return
        }
        
        // TODO: Initialize Tapjoy SDK
        // Tapjoy.connect(sdkKey, options: options)
        isInitialized = true
        completion(nil)
    }
}
