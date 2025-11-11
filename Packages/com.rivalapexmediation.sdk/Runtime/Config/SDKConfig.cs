using UnityEngine;

namespace RivalApex.Mediation
{
    /// <summary>
    /// SDK configuration stored as ScriptableObject for Inspector editing
    /// </summary>
    [CreateAssetMenu(fileName = "ApexSDKConfig", menuName = "Apex Mediation/SDK Config")]
    public class SDKConfig : ScriptableObject
    {
        [Header("Authentication")]
        [Tooltip("Your application ID from Apex Mediation dashboard")]
        public string AppId;
        
        [Tooltip("Your API key from Apex Mediation dashboard")]
        public string ApiKey;
        
        [Header("Environment")]
        [Tooltip("Enable test mode for debugging (uses test ads)")]
        public bool TestMode = false;
        
        [Tooltip("Enable verbose logging for debugging")]
        public bool DebugLogging = false;
        
        [Header("Network")]
        [Tooltip("Auction server base URL")]
        public string AuctionEndpoint = "https://auction.apexmediation.com/v1";
        
        [Tooltip("Config server URL for OTA updates")]
        public string ConfigEndpoint = "https://config.apexmediation.com/v1";
        
        [Tooltip("Request timeout in seconds")]
        [Range(3, 30)]
        public int RequestTimeout = 5;
        
        [Tooltip("Maximum number of retry attempts for failed requests")]
        [Range(0, 3)]
        public int MaxRetries = 1;
        
        [Header("Ad Behavior")]
        [Tooltip("Default TTL for cached ads in seconds")]
        [Range(300, 7200)]
        public int DefaultAdTTL = 3600;
        
        [Tooltip("Banner auto-refresh interval in seconds (0 = disabled)")]
        [Range(0, 120)]
        public int BannerRefreshInterval = 60;
        
        [Tooltip("App open ad rate limit in seconds (prevent too frequent shows)")]
        [Range(3600, 86400)]
        public int AppOpenRateLimit = 14400; // 4 hours
        
        [Header("Privacy")]
        [Tooltip("Enable COPPA compliance mode (restricts data collection)")]
        public bool COPPAEnabled = false;
        
        [Tooltip("Default GDPR consent if user hasn't set it explicitly")]
        public bool DefaultGDPRConsent = false;
        
        public void Validate()
        {
            if (string.IsNullOrEmpty(AppId))
            {
                Debug.LogError("[ApexMediation] AppId is required in SDKConfig");
            }
            
            if (string.IsNullOrEmpty(ApiKey))
            {
                Debug.LogError("[ApexMediation] ApiKey is required in SDKConfig");
            }
            
            if (string.IsNullOrEmpty(AuctionEndpoint))
            {
                Debug.LogError("[ApexMediation] AuctionEndpoint is required in SDKConfig");
            }
        }
    }
}
