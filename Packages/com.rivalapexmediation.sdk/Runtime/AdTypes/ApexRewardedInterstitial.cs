using System;
using System.Collections;
using System.Collections.Generic;
using UnityEngine;

namespace RivalApex.Mediation
{
    /// <summary>
    /// Rewarded interstitial ad format - full-screen ads with optional rewards
    /// Hybrid between interstitial (full-screen) and rewarded (completion reward)
    /// </summary>
    public static class ApexRewardedInterstitial
    {
        private static readonly Dictionary<string, RewardedInterstitialAdInstance> _adInstances = new Dictionary<string, RewardedInterstitialAdInstance>();
        
        /// <summary>
        /// Load a rewarded interstitial ad for the specified placement
        /// </summary>
        public static void Load(string placementId, Action<AdError> onLoaded)
        {
            if (!ValidateInitialized(onLoaded)) return;
            if (!ValidatePlacementId(placementId, onLoaded)) return;
            
            Logger.Log($"Loading rewarded interstitial: {placementId}");
            
            MediationSDK.Instance.StartCoroutine(LoadCoroutine(placementId, onLoaded));
        }
        
        /// <summary>
        /// Check if a rewarded interstitial ad is ready to show
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
        /// Show a loaded rewarded interstitial ad
        /// </summary>
        public static void Show(string placementId, Action<AdError> onShown, Action<Reward> onRewarded, Action onClosed)
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
            
            Logger.Log($"Showing rewarded interstitial: {placementId}");
            MediationSDK.Instance.StartCoroutine(instance.Show(onShown, onRewarded, onClosed));
        }
        
        private static IEnumerator LoadCoroutine(string placementId, Action<AdError> onLoaded)
        {
            // Request bid from auction
            AdResponse response = null;
            AdError error = null;
            bool requestComplete = false;
            
            yield return MediationSDK.Instance.AuctionClient.RequestBid(
                placementId,
                AdType.RewardedInterstitial,
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
                Logger.LogError($"Failed to load rewarded interstitial: {error}");
                onLoaded?.Invoke(error);
                yield break;
            }
            
            // Create ad instance
            var instance = new RewardedInterstitialAdInstance(placementId, response);
            _adInstances[placementId] = instance;
            
            Logger.Log($"Rewarded interstitial loaded: {placementId}");
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
    /// Internal class representing a loaded rewarded interstitial ad
    /// </summary>
    internal class RewardedInterstitialAdInstance
    {
        private readonly string _placementId;
        private readonly AdResponse _response;
        private readonly float _expiryTime;
        private readonly int _skipDelaySeconds;
        private bool _isShowing;
        
        public RewardedInterstitialAdInstance(string placementId, AdResponse response)
        {
            _placementId = placementId;
            _response = response;
            _expiryTime = Time.realtimeSinceStartup + response.ttl_seconds;
            _skipDelaySeconds = response.metadata?.skip_delay_seconds ?? 5;
            _isShowing = false;
        }
        
        public bool IsReady()
        {
            return !_isShowing && Time.realtimeSinceStartup < _expiryTime;
        }
        
        public IEnumerator Show(Action<AdError> onShown, Action<Reward> onRewarded, Action onClosed)
        {
            if (_isShowing)
            {
                Logger.LogWarning("Ad is already showing");
                onShown?.Invoke(AdError.InternalError("Ad already showing"));
                yield break;
            }
            
            _isShowing = true;
            
            // TODO: Load and display creative with skip button
            // For now, simulate ad display with skip countdown
            Logger.Log($"[MOCK] Displaying rewarded interstitial: {_response.creative_url}");
            Logger.Log($"[MOCK] Skip available after {_skipDelaySeconds} seconds");
            onShown?.Invoke(null);
            
            // Simulate countdown before skip is available
            yield return new WaitForSeconds(_skipDelaySeconds);
            Logger.Log($"[MOCK] Skip button now enabled");
            
            // Simulate user decision: 70% watch to completion, 30% skip early
            var watchToCompletion = UnityEngine.Random.value > 0.3f;
            
            if (watchToCompletion)
            {
                // User watches to completion
                var remainingDuration = (_response.metadata?.duration_seconds ?? 10) - _skipDelaySeconds;
                yield return new WaitForSeconds(Mathf.Max(0, remainingDuration));
                
                // Grant reward on completion
                var reward = Reward.FromRewardData(_response.metadata?.reward);
                Logger.Log($"[MOCK] Rewarded interstitial completed - granting reward: {reward.Type} x{reward.Amount}");
                onRewarded?.Invoke(reward);
            }
            else
            {
                // User skips after countdown
                yield return new WaitForSeconds(2f);
                Logger.Log($"[MOCK] User skipped ad (no reward)");
            }
            
            yield return new WaitForSeconds(0.5f);
            
            Logger.Log($"[MOCK] Rewarded interstitial closed");
            _isShowing = false;
            onClosed?.Invoke();
        }
    }
}
