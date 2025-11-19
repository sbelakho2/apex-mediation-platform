import Foundation

@objc(RAMSmaatoAdapter)
public class SmaatoAdapter: NSObject, RAMAdNetworkAdapter {
    public let networkName = "smaato"
    public let version = "1.0.0"
    public let minSDKVersion = "1.0.0"
    
    private var isInitialized = false
    
    public func initialize(with config: [String: Any], completion: @escaping (Error?) -> Void) {
        if isInitialized {
            completion(nil)
            return
        }
        
        // TODO: Initialize Smaato SDK
        // SMAAdvertisingInfo.setPublisherId(publisherId)
        isInitialized = true
        completion(nil)
    }
}
