namespace RivalApex.Mediation
{
    /// <summary>
    /// Ad type for auction requests
    /// </summary>
    public enum AdType
    {
        Interstitial,
        Rewarded,
        Banner,
        RewardedInterstitial,
        AppOpen
    }
    
    /// <summary>
    /// Represents an ad request to the auction server
    /// </summary>
    [System.Serializable]
    public class AdRequest
    {
        public string placement_id;
        public string ad_type;
        public string app_id;
        public DeviceInfo device;
        public ConsentData consent;
        public string sdk_version;
        public bool test_mode;
        
        public AdRequest(string placementId, AdType adType, string appId, DeviceInfo deviceInfo, ConsentData consentData, string sdkVersion, bool testMode)
        {
            placement_id = placementId;
            ad_type = adType.ToString().ToLower();
            app_id = appId;
            device = deviceInfo;
            consent = consentData;
            sdk_version = sdkVersion;
            test_mode = testMode;
        }
    }
    
    /// <summary>
    /// Device information for ad requests
    /// </summary>
    [System.Serializable]
    public class DeviceInfo
    {
        public string platform;           // "iOS", "Android", "WebGL", "Standalone"
        public string os_version;         // e.g., "iOS 16.4"
        public string device_model;       // e.g., "iPhone14,2"
        public string device_id;          // IDFV on iOS, Android ID hash on Android
        public string advertising_id;     // IDFA/GAID if available
        public bool limit_ad_tracking;    // ATT/LAT status
        public string language;           // e.g., "en-US"
        public int screen_width;
        public int screen_height;
        public float screen_density;
        public string user_agent;
        public string connection_type;    // "wifi", "cellular", "unknown"
    }
    
    /// <summary>
    /// Response from auction server
    /// </summary>
    [System.Serializable]
    public class AdResponse
    {
        public string ad_id;
        public string creative_url;
        public string adapter_name;
        public int ttl_seconds;           // Time to live for cached ad
        public AdMetadata metadata;
        
        public AdResponse()
        {
            ttl_seconds = 3600; // Default 1 hour
        }
    }
    
    /// <summary>
    /// Additional metadata for ad creative
    /// </summary>
    [System.Serializable]
    public class AdMetadata
    {
        public string creative_type;      // "image", "video", "html"
        public int width;
        public int height;
        public int duration_seconds;      // For video ads
        public bool skippable;
        public int skip_delay_seconds;
        public RewardData reward;         // For rewarded ads
    }
    
    /// <summary>
    /// Reward information for rewarded ads
    /// </summary>
    [System.Serializable]
    public class RewardData
    {
        public string type;               // e.g., "coins", "lives"
        public int amount;                // e.g., 100
        
        public RewardData(string type, int amount)
        {
            this.type = type;
            this.amount = amount;
        }
    }
    
    /// <summary>
    /// Public reward struct for callbacks
    /// </summary>
    public struct Reward
    {
        public string Type;
        public int Amount;
        
        public Reward(string type, int amount)
        {
            Type = type;
            Amount = amount;
        }
        
        public static Reward FromRewardData(RewardData data)
        {
            return new Reward(data?.type ?? "default", data?.amount ?? 0);
        }
    }
}
