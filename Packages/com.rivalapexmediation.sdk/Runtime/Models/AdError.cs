namespace RivalApex.Mediation
{
    /// <summary>
    /// Standard error codes for ad operations matching iOS/Android taxonomy
    /// </summary>
    public enum AdErrorCode
    {
        /// <summary>No ad available to serve for this placement</summary>
        NO_FILL,
        
        /// <summary>Request timed out before completion</summary>
        TIMEOUT,
        
        /// <summary>Network unreachable or connection failed</summary>
        NETWORK_ERROR,
        
        /// <summary>Too many requests, rate limit exceeded</summary>
        RATE_LIMIT,
        
        /// <summary>Placement ID not found or invalid</summary>
        INVALID_PLACEMENT,
        
        /// <summary>Internal SDK or server error</summary>
        INTERNAL_ERROR,
        
        /// <summary>Ad loaded but expired before show</summary>
        AD_EXPIRED,
        
        /// <summary>SDK not initialized before API call</summary>
        NOT_INITIALIZED,
        
        /// <summary>Invalid API key or authentication failed</summary>
        INVALID_API_KEY,
        
        /// <summary>Creative failed to load or render</summary>
        CREATIVE_ERROR
    }
    
    /// <summary>
    /// Represents an error that occurred during ad operations
    /// </summary>
    public class AdError
    {
        public AdErrorCode Code { get; }
        public string Message { get; }
        public string DebugDetails { get; }
        
        public AdError(AdErrorCode code, string message, string debugDetails = null)
        {
            Code = code;
            Message = message;
            DebugDetails = debugDetails;
        }
        
        public override string ToString()
        {
            var result = $"AdError[{Code}]: {Message}";
            if (!string.IsNullOrEmpty(DebugDetails))
            {
                result += $" (Debug: {DebugDetails})";
            }
            return result;
        }
        
        // Factory methods for common errors
        public static AdError NoFill() => new AdError(AdErrorCode.NO_FILL, "No ad available for this placement");
        public static AdError Timeout() => new AdError(AdErrorCode.TIMEOUT, "Request timed out");
        public static AdError NetworkError(string details = null) => new AdError(AdErrorCode.NETWORK_ERROR, "Network error", details);
        public static AdError RateLimit() => new AdError(AdErrorCode.RATE_LIMIT, "Rate limit exceeded");
        public static AdError InvalidPlacement(string placementId) => new AdError(AdErrorCode.INVALID_PLACEMENT, $"Invalid placement: {placementId}");
        public static AdError InternalError(string details = null) => new AdError(AdErrorCode.INTERNAL_ERROR, "Internal error", details);
        public static AdError AdExpired() => new AdError(AdErrorCode.AD_EXPIRED, "Ad has expired");
        public static AdError NotInitialized() => new AdError(AdErrorCode.NOT_INITIALIZED, "SDK not initialized");
        public static AdError InvalidApiKey() => new AdError(AdErrorCode.INVALID_API_KEY, "Invalid API key");
        public static AdError CreativeError(string details = null) => new AdError(AdErrorCode.CREATIVE_ERROR, "Failed to load creative", details);
    }
}
