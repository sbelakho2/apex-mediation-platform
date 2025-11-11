using UnityEngine;

namespace RivalApex.Mediation
{
    /// <summary>
    /// Standalone/Editor platform bridge with mock implementations
    /// </summary>
    public class StandalonePlatformBridge : IPlatformBridge
    {
        public string PlatformName => "Standalone";
        
        public string GetDeviceId()
        {
            return SystemInfo.deviceUniqueIdentifier;
        }
        
        public string GetAdvertisingId()
        {
            // No advertising ID on standalone
            return null;
        }
        
        public bool IsLimitAdTrackingEnabled()
        {
            return false;
        }
        
        public string GetUserAgent()
        {
            var sdkVersion = ApexMediation.Version;
            var platform = Application.platform;
            return $"ApexMediation-Unity/{sdkVersion} ({platform})";
        }
        
        public void OpenURL(string url)
        {
            Application.OpenURL(url);
        }
        
        public void ShowNativeDialog(string title, string message)
        {
            Debug.Log($"[Standalone Dialog] {title}: {message}");
        }
        
        public string GetConnectionType()
        {
            switch (Application.internetReachability)
            {
                case NetworkReachability.ReachableViaLocalAreaNetwork:
                    return "wifi";
                default:
                    return "unknown";
            }
        }
    }
}
