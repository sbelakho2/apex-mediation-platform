using System;
using System.Collections;
using System.Collections.Generic;
using UnityEngine;

namespace RivalApex.Mediation
{
    /// <summary>
    /// Interstitial ad format - full-screen ads
    /// </summary>
    public static class ApexInterstitial
    {
        private static readonly Dictionary<string, InterstitialAdInstance> _adInstances = new Dictionary<string, InterstitialAdInstance>();
        
        /// <summary>
        /// Load an interstitial ad for the specified placement
        /// </summary>
        public static void Load(string placementId, Action<AdError> onLoaded)
        {
            if (!ValidateInitialized(onLoaded)) return;
            if (!ValidatePlacementId(placementId, onLoaded)) return;
            
            Logger.Log($"Loading interstitial: {placementId}");
            
            MediationSDK.Instance.StartCoroutine(LoadCoroutine(placementId, onLoaded));
        }
        
        /// <summary>
        /// Check if an interstitial ad is ready to show
        /// </summary>
        public static bool IsReady(string placementId)
        {
            if (!ApexMediation.IsInitialized || string.IsNullOrEmpty(placementId))
            {
                return false;
            }
            
            if (!_adInstances.TryGetValue(placementId, out var instance))
            {
                return false;
            }
            
            return instance.IsReady();
        }
        
        /// <summary>
        /// Show a loaded interstitial ad
        /// </summary>
        public static void Show(string placementId, Action<AdError> onShown, Action onClosed)
        {
            if (!ValidateInitialized(onShown)) return;
            if (!ValidatePlacementId(placementId, onShown)) return;
            
            if (!_adInstances.TryGetValue(placementId, out var instance))
            {
                Logger.LogError($"No ad loaded for placement: {placementId}");
                onShown?.Invoke(AdError.InternalError("Ad not loaded"));
                return;
            }
            
            if (!instance.IsReady())
            {
                Logger.LogError($"Ad not ready or expired: {placementId}");
                onShown?.Invoke(AdError.AdExpired());
                return;
            }
            
            Logger.Log($"Showing interstitial: {placementId}");
            MediationSDK.Instance.StartCoroutine(instance.Show(onShown, onClosed));
        }
        
        private static IEnumerator LoadCoroutine(string placementId, Action<AdError> onLoaded)
        {
            // Request bid from auction
            AdResponse response = null;
            AdError error = null;
            bool requestComplete = false;
            
            yield return MediationSDK.Instance.AuctionClient.RequestBid(
                placementId,
                AdType.Interstitial,
                (r, e) =>
                {
                    response = r;
                    error = e;
                    requestComplete = true;
                }
            );
            
            // Wait for request completion
            while (!requestComplete)
            {
                yield return null;
            }
            
            if (error != null)
            {
                Logger.LogError($"Failed to load interstitial: {error}");
                onLoaded?.Invoke(error);
                yield break;
            }
            
            // Create ad instance
            var instance = new InterstitialAdInstance(placementId, response);
            _adInstances[placementId] = instance;
            
            Logger.Log($"Interstitial loaded: {placementId}");
            onLoaded?.Invoke(null);
        }
        
        private static bool ValidateInitialized(Action<AdError> onError)
        {
            if (!ApexMediation.IsInitialized)
            {
                Logger.LogError("SDK not initialized");
                onError?.Invoke(AdError.NotInitialized());
                return false;
            }
            return true;
        }
        
        private static bool ValidatePlacementId(string placementId, Action<AdError> onError)
        {
            if (string.IsNullOrEmpty(placementId))
            {
                Logger.LogError("Placement ID is null or empty");
                onError?.Invoke(AdError.InvalidPlacement(placementId));
                return false;
            }
            return true;
        }
    }
    
    /// <summary>
    /// Internal class representing a loaded interstitial ad
    /// </summary>
    internal class InterstitialAdInstance
    {
        private readonly string _placementId;
        private readonly AdResponse _response;
        private readonly float _expiryTime;
        private bool _isShowing;
        
        public InterstitialAdInstance(string placementId, AdResponse response)
        {
            _placementId = placementId;
            _response = response;
            _expiryTime = Time.realtimeSinceStartup + response.ttl_seconds;
            _isShowing = false;
        }
        
        public bool IsReady()
        {
            return !_isShowing && Time.realtimeSinceStartup < _expiryTime;
        }
        
        public IEnumerator Show(Action<AdError> onShown, Action onClosed)
        {
            if (_isShowing)
            {
                Logger.LogWarning("Ad is already showing");
                onShown?.Invoke(AdError.InternalError("Ad already showing"));
                yield break;
            }
            
            _isShowing = true;
            
            // TODO: Load and display creative
            // For now, simulate ad display with delay
            Logger.Log($"[MOCK] Displaying interstitial creative: {_response.creative_url}");
            onShown?.Invoke(null);
            
            // Simulate ad display duration (5 seconds)
            yield return new WaitForSeconds(5f);
            
            Logger.Log($"[MOCK] Interstitial closed by user");
            _isShowing = false;
            onClosed?.Invoke();
        }
    }
}
