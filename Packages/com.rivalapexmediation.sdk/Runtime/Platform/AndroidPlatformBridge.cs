using UnityEngine;

namespace RivalApex.Mediation
{
    /// <summary>
    /// Android platform bridge using AndroidJavaObject
    /// </summary>
    public class AndroidPlatformBridge : IPlatformBridge
    {
        public string PlatformName => "Android";
        
        private AndroidJavaObject _currentActivity;
        
        public AndroidPlatformBridge()
        {
#if UNITY_ANDROID && !UNITY_EDITOR
            try
            {
                using (var unityPlayer = new AndroidJavaClass("com.unity3d.player.UnityPlayer"))
                {
                    _currentActivity = unityPlayer.GetStatic<AndroidJavaObject>("currentActivity");
                }
            }
            catch (System.Exception e)
            {
                Logger.LogError($"Failed to get Android activity: {e.Message}");
            }
#endif
        }
        
        public string GetDeviceId()
        {
#if UNITY_ANDROID && !UNITY_EDITOR
            try
            {
                using (var contentResolver = _currentActivity.Call<AndroidJavaObject>("getContentResolver"))
                using (var settings = new AndroidJavaClass("android.provider.Settings$Secure"))
                {
                    var androidId = settings.CallStatic<string>("getString", contentResolver, "android_id");
                    return HashAndroidId(androidId);
                }
            }
            catch (System.Exception e)
            {
                Logger.LogError($"Failed to get Android ID: {e.Message}");
                return SystemInfo.deviceUniqueIdentifier;
            }
#else
            return SystemInfo.deviceUniqueIdentifier;
#endif
        }
        
        public string GetAdvertisingId()
        {
#if UNITY_ANDROID && !UNITY_EDITOR
            try
            {
                // Note: Requires Google Play Services
                // In production, this should check if Play Services is available
                using (var advertisingIdClient = new AndroidJavaClass("com.google.android.gms.ads.identifier.AdvertisingIdClient"))
                {
                    var adInfo = advertisingIdClient.CallStatic<AndroidJavaObject>("getAdvertisingIdInfo", _currentActivity);
                    if (adInfo != null)
                    {
                        var gaid = adInfo.Call<string>("getId");
                        var isLAT = adInfo.Call<bool>("isLimitAdTrackingEnabled");
                        
                        if (isLAT)
                        {
                            return null; // User has limited ad tracking
                        }
                        
                        return gaid;
                    }
                }
            }
            catch (System.Exception e)
            {
                Logger.Log($"GAID unavailable (Play Services may not be installed): {e.Message}");
            }
#endif
            return null;
        }
        
        public bool IsLimitAdTrackingEnabled()
        {
#if UNITY_ANDROID && !UNITY_EDITOR
            try
            {
                using (var advertisingIdClient = new AndroidJavaClass("com.google.android.gms.ads.identifier.AdvertisingIdClient"))
                {
                    var adInfo = advertisingIdClient.CallStatic<AndroidJavaObject>("getAdvertisingIdInfo", _currentActivity);
                    if (adInfo != null)
                    {
                        return adInfo.Call<bool>("isLimitAdTrackingEnabled");
                    }
                }
            }
            catch
            {
                return true; // Conservative default
            }
#endif
            return false;
        }
        
        public string GetUserAgent()
        {
            var sdkVersion = ApexMediation.Version;
            var osVersion = SystemInfo.operatingSystem;
            var deviceModel = SystemInfo.deviceModel;
            return $"ApexMediation-Unity/{sdkVersion} (Android; {osVersion}; {deviceModel})";
        }
        
        public void OpenURL(string url)
        {
            Application.OpenURL(url);
        }
        
        public void ShowNativeDialog(string title, string message)
        {
#if UNITY_ANDROID && !UNITY_EDITOR
            try
            {
                _currentActivity.Call("runOnUiThread", new AndroidJavaRunnable(() =>
                {
                    using (var builder = new AndroidJavaObject("android.app.AlertDialog$Builder", _currentActivity))
                    {
                        builder.Call<AndroidJavaObject>("setTitle", title);
                        builder.Call<AndroidJavaObject>("setMessage", message);
                        builder.Call<AndroidJavaObject>("setPositiveButton", "OK", null);
                        builder.Call<AndroidJavaObject>("show");
                    }
                }));
            }
            catch (System.Exception e)
            {
                Logger.LogError($"Failed to show native dialog: {e.Message}");
            }
#else
            Debug.Log($"[Android Dialog] {title}: {message}");
#endif
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
        
        private string HashAndroidId(string androidId)
        {
            if (string.IsNullOrEmpty(androidId))
            {
                return SystemInfo.deviceUniqueIdentifier;
            }
            
            // Hash Android ID for privacy
            using (var sha256 = System.Security.Cryptography.SHA256.Create())
            {
                var bytes = System.Text.Encoding.UTF8.GetBytes(androidId);
                var hash = sha256.ComputeHash(bytes);
                return System.BitConverter.ToString(hash).Replace("-", "").ToLower();
            }
        }
    }
}
