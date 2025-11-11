using UnityEngine;

namespace RivalApex.Mediation
{
    /// <summary>
    /// WebGL platform bridge with limited functionality
    /// </summary>
    public class WebGLPlatformBridge : IPlatformBridge
    {
        public string PlatformName => "WebGL";
        
        public string GetDeviceId()
        {
            // WebGL uses SystemInfo.deviceUniqueIdentifier which is persistent per browser
            return SystemInfo.deviceUniqueIdentifier;
        }
        
        public string GetAdvertisingId()
        {
            // No advertising ID available on WebGL
            return null;
        }
        
        public bool IsLimitAdTrackingEnabled()
        {
            // Conservative default for WebGL (no tracking)
            return true;
        }
        
        public string GetUserAgent()
        {
            var sdkVersion = ApexMediation.Version;
#if UNITY_WEBGL && !UNITY_EDITOR
            // Could use Application.ExternalEval to get browser UA, but kept simple
            return $"ApexMediation-Unity/{sdkVersion} (WebGL)";
#else
            return $"ApexMediation-Unity/{sdkVersion} (WebGL; Editor)";
#endif
        }
        
        public void OpenURL(string url)
        {
            Application.OpenURL(url);
        }
        
        public void ShowNativeDialog(string title, string message)
        {
#if UNITY_WEBGL && !UNITY_EDITOR
            // Use JavaScript alert
            Application.ExternalCall("alert", $"{title}: {message}");
#else
            Debug.Log($"[WebGL Dialog] {title}: {message}");
#endif
        }
        
        public string GetConnectionType()
        {
            // WebGL always reports as wifi (browser connection)
            return Application.internetReachability == NetworkReachability.NotReachable ? "unknown" : "wifi";
        }
    }
}
