import Foundation

@objc(RAMChartboostAdapter)
public class ChartboostAdapter: NSObject, RAMAdNetworkAdapter {
    public let networkName = "chartboost"
    public let version = "1.0.0"
    public let minSDKVersion = "1.0.0"
    
    private var isInitialized = false
    
    public func initialize(with config: [String: Any], completion: @escaping (Error?) -> Void) {
        if isInitialized {
            completion(nil)
            return
        }
        
        // TODO: Initialize Chartboost SDK
        // Chartboost.start(withAppId: appId, appSignature: signature) { ... }
        isInitialized = true
        completion(nil)
    }
}
