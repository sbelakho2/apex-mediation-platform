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
        public string AuctionEndpoint = "https://auction.apexmediation.ee/v1";
        
        [Tooltip("Config server URL for OTA updates")]
        public string ConfigEndpoint = "https://config.apexmediation.ee/v1";

    [Tooltip("Optional override URL for remote config fetches")]
    public string RemoteConfigUrl;

    [Tooltip("Optional API base URL used to derive remote config endpoint when override is not set")]
    public string ApiBaseUrl;

    [Tooltip("Remote config timeout in milliseconds (minimum 500ms)")]
    [Min(500)]
    public int RemoteConfigTimeoutMs = 3000;
        
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

        [Header("Performance Budgets")]
        [Tooltip("Enable runtime performance instrumentation for memory budgets")]
        public bool EnablePerformanceBudgetChecks = true;

        [Tooltip("Maximum allowed bytes allocated per auction request payload")]
        [Min(1024)]
        public int RequestAllocationBudgetBytes = 50 * 1024;

        [Tooltip("Maximum allowed idle GC allocations per frame in bytes")]
        [Min(256)]
        public int IdleAllocationBudgetBytes = 1024;

        [Tooltip("Allowed percentage over baseline idle allocations before flagging regression")]
        [Range(1f, 100f)]
        public float PerfRegressionTolerancePercent = 10f;
        
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

            RequestAllocationBudgetBytes = Mathf.Max(1024, RequestAllocationBudgetBytes);
            IdleAllocationBudgetBytes = Mathf.Max(256, IdleAllocationBudgetBytes);
            PerfRegressionTolerancePercent = Mathf.Clamp(PerfRegressionTolerancePercent, 1f, 100f);
            RemoteConfigTimeoutMs = Mathf.Max(500, RemoteConfigTimeoutMs);
        }
    }
}
