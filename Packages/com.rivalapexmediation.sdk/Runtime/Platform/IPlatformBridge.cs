namespace RivalApex.Mediation
{
    /// <summary>
    /// Platform abstraction for platform-specific functionality
    /// </summary>
    public interface IPlatformBridge
    {
        /// <summary>
        /// Get persistent device identifier (IDFV on iOS, Android ID hash on Android)
        /// </summary>
        string GetDeviceId();
        
        /// <summary>
        /// Get advertising identifier (IDFA on iOS, GAID on Android)
        /// Returns null if unavailable or user has not granted permission
        /// </summary>
        string GetAdvertisingId();
        
        /// <summary>
        /// Check if user has limited ad tracking (ATT denied on iOS, LAT enabled on Android)
        /// </summary>
        bool IsLimitAdTrackingEnabled();
        
        /// <summary>
        /// Get User-Agent string for HTTP requests
        /// </summary>
        string GetUserAgent();
        
        /// <summary>
        /// Open URL in platform-appropriate browser
        /// </summary>
        void OpenURL(string url);
        
        /// <summary>
        /// Show native alert dialog (platform-specific)
        /// </summary>
        void ShowNativeDialog(string title, string message);
        
        /// <summary>
        /// Get connection type (wifi, cellular, unknown)
        /// </summary>
        string GetConnectionType();
        
        /// <summary>
        /// Platform name for logging
        /// </summary>
        string PlatformName { get; }
    }
}
