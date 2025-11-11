using System;
using UnityEngine;

namespace RivalApex.Mediation
{
    /// <summary>
    /// Main static API for Apex Mediation SDK
    /// </summary>
    public static class ApexMediation
    {
        public const string Version = "1.0.0";
        
        /// <summary>
        /// Check if SDK is initialized
        /// </summary>
        public static bool IsInitialized => MediationSDK.Instance.IsInitialized;
        
        /// <summary>
        /// Initialize the SDK with configuration
        /// </summary>
        /// <param name="config">SDK configuration (create via ScriptableObject)</param>
        /// <param name="onComplete">Callback with initialization result (true = success, false = failure)</param>
        public static void Initialize(SDKConfig config, Action<bool> onComplete)
        {
            if (config == null)
            {
                Logger.LogError("Cannot initialize SDK with null config");
                onComplete?.Invoke(false);
                return;
            }
            
            MediationSDK.Instance.Initialize(config, onComplete);
        }
        
        /// <summary>
        /// Set user consent for GDPR/CCPA/COPPA compliance
        /// </summary>
        /// <param name="consent">Consent data</param>
        public static void SetConsent(ConsentData consent)
        {
            if (!CheckInitialized("SetConsent")) return;
            
            MediationSDK.Instance.ConsentManager.SetConsent(consent);
        }
        
        /// <summary>
        /// Get current consent data
        /// </summary>
        public static ConsentData GetConsent()
        {
            if (!CheckInitialized("GetConsent")) return new ConsentData();
            
            return MediationSDK.Instance.ConsentManager.GetConsent();
        }
        
        /// <summary>
        /// Check if personalized ads can be shown based on consent
        /// </summary>
        public static bool CanShowPersonalizedAds()
        {
            if (!CheckInitialized("CanShowPersonalizedAds")) return false;
            
            return MediationSDK.Instance.ConsentManager.CanShowPersonalizedAds();
        }
        
        /// <summary>
        /// Set test mode (uses test ads, more verbose logging)
        /// </summary>
        public static void SetTestMode(bool enabled)
        {
            if (!CheckInitialized("SetTestMode")) return;
            
            MediationSDK.Instance.Config.TestMode = enabled;
            Logger.Log($"Test mode {(enabled ? "enabled" : "disabled")}");
        }
        
        /// <summary>
        /// Set debug logging (verbose logging)
        /// </summary>
        public static void SetDebugLogging(bool enabled)
        {
            Logger.SetDebugLogging(enabled);
        }
        
        /// <summary>
        /// Get debug information about SDK state
        /// </summary>
        public static string GetDebugInfo()
        {
            if (!IsInitialized)
            {
                return "SDK not initialized";
            }
            
            var sdk = MediationSDK.Instance;
            var consent = sdk.ConsentManager.GetRedactedConsentInfo();
            
            return $"Apex Mediation SDK v{Version}\n" +
                   $"Initialized: {sdk.IsInitialized}\n" +
                   $"Platform: {sdk.PlatformBridge.PlatformName}\n" +
                   $"App ID: {sdk.Config.AppId}\n" +
                   $"Test Mode: {sdk.Config.TestMode}\n" +
                   $"Consent: {consent}\n" +
                   $"Unity: {Application.unityVersion}\n" +
                   $"Device: {SystemInfo.deviceModel}\n" +
                   $"OS: {SystemInfo.operatingSystem}";
        }
        
        private static bool CheckInitialized(string methodName)
        {
            if (!IsInitialized)
            {
                Logger.LogError($"Cannot call {methodName}: SDK not initialized. Call ApexMediation.Initialize() first.");
                return false;
            }
            return true;
        }
    }
}
