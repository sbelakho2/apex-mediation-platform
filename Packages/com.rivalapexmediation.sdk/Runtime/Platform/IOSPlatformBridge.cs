using UnityEngine;
using System.Runtime.InteropServices;

namespace RivalApex.Mediation
{
    /// <summary>
    /// iOS platform bridge using native plugins
    /// </summary>
    public class IOSPlatformBridge : IPlatformBridge
    {
        public string PlatformName => "iOS";
        
#if UNITY_IOS && !UNITY_EDITOR
        [DllImport("__Internal")]
        private static extern string _ApexGetIDFV();
        
        [DllImport("__Internal")]
        private static extern string _ApexGetIDFA();
        
        [DllImport("__Internal")]
        private static extern int _ApexGetATTStatus();
        
        [DllImport("__Internal")]
        private static extern void _ApexOpenURL(string url);
#endif
        
        public string GetDeviceId()
        {
#if UNITY_IOS && !UNITY_EDITOR
            try
            {
                return _ApexGetIDFV();
            }
            catch (System.Exception e)
            {
                Logger.LogError($"Failed to get IDFV: {e.Message}");
                return SystemInfo.deviceUniqueIdentifier;
            }
#else
            return SystemInfo.deviceUniqueIdentifier;
#endif
        }
        
        public string GetAdvertisingId()
        {
#if UNITY_IOS && !UNITY_EDITOR
            try
            {
                var idfa = _ApexGetIDFA();
                // Return null if IDFA is all zeros (user denied ATT)
                if (string.IsNullOrEmpty(idfa) || idfa == "00000000-0000-0000-0000-000000000000")
                {
                    return null;
                }
                return idfa;
            }
            catch (System.Exception e)
            {
                Logger.LogError($"Failed to get IDFA: {e.Message}");
                return null;
            }
#else
            return null;
#endif
        }
        
        public bool IsLimitAdTrackingEnabled()
        {
#if UNITY_IOS && !UNITY_EDITOR
            try
            {
                // ATT status: 0=notDetermined, 1=restricted, 2=denied, 3=authorized
                var attStatus = _ApexGetATTStatus();
                return attStatus != 3; // LAT if not authorized
            }
            catch
            {
                return true; // Conservative default
            }
#else
            return false;
#endif
        }
        
        public string GetUserAgent()
        {
            var sdkVersion = ApexMediation.Version;
            var osVersion = SystemInfo.operatingSystem;
            var deviceModel = SystemInfo.deviceModel;
            return $"ApexMediation-Unity/{sdkVersion} ({osVersion}; {deviceModel})";
        }
        
        public void OpenURL(string url)
        {
#if UNITY_IOS && !UNITY_EDITOR
            try
            {
                _ApexOpenURL(url);
            }
            catch
            {
                Application.OpenURL(url);
            }
#else
            Application.OpenURL(url);
#endif
        }
        
        public void ShowNativeDialog(string title, string message)
        {
            // iOS native alert requires native code, fallback to Unity dialog for now
            Debug.Log($"[iOS Dialog] {title}: {message}");
        }
        
        public string GetConnectionType()
        {
            switch (Application.internetReachability)
            {
                case NetworkReachability.ReachableViaCarrierDataNetwork:
                    return "cellular";
                case NetworkReachability.ReachableViaLocalAreaNetwork:
                    return "wifi";
                default:
                    return "unknown";
            }
        }
    }
}
