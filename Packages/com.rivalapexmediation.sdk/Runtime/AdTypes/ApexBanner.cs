using System;
using System.Collections;
using System.Collections.Generic;
using UnityEngine;

namespace RivalApex.Mediation
{
    /// <summary>
    /// Banner ad format - persistent rectangular ads
    /// </summary>
    public static class ApexBanner
    {
        public enum BannerSize
        {
            Banner_320x50,
            MediumRectangle_300x250,
            Leaderboard_728x90,
            Adaptive // Match screen width, dynamic height
        }
        
        public enum BannerPosition
        {
            Top,
            TopLeft,
            TopRight,
            Bottom,
            BottomLeft,
            BottomRight,
            Center
        }
        
        private static readonly Dictionary<string, BannerAdInstance> _adInstances = new Dictionary<string, BannerAdInstance>();
        
        /// <summary>
        /// Create and load a banner ad
        /// </summary>
        public static void Create(string placementId, BannerSize size, BannerPosition position, Action<AdError> onLoaded)
        {
            if (!ValidateInitialized(onLoaded)) return;
            if (!ValidatePlacementId(placementId, onLoaded)) return;
            
            Logger.Log($"Creating banner: {placementId}, size: {size}, position: {position}");
            
            // Destroy existing banner if present
            if (_adInstances.ContainsKey(placementId))
            {
                Destroy(placementId);
            }
            
            MediationSDK.Instance.StartCoroutine(CreateCoroutine(placementId, size, position, onLoaded));
        }
        
        /// <summary>
        /// Show a created banner
        /// </summary>
        public static void Show(string placementId)
        {
            if (!ApexMediation.IsInitialized || string.IsNullOrEmpty(placementId))
            {
                Logger.LogError("Cannot show banner: SDK not initialized or invalid placement ID");
                return;
            }
            
            if (_adInstances.TryGetValue(placementId, out var instance))
            {
                instance.Show();
                Logger.Log($"Banner shown: {placementId}");
            }
            else
            {
                Logger.LogError($"Banner not found: {placementId}");
            }
        }
        
        /// <summary>
        /// Hide a banner (keeps it loaded)
        /// </summary>
        public static void Hide(string placementId)
        {
            if (!ApexMediation.IsInitialized || string.IsNullOrEmpty(placementId))
            {
                return;
            }
            
            if (_adInstances.TryGetValue(placementId, out var instance))
            {
                instance.Hide();
                Logger.Log($"Banner hidden: {placementId}");
            }
        }
        
        /// <summary>
        /// Destroy a banner and clean up resources
        /// </summary>
        public static void Destroy(string placementId)
        {
            if (!ApexMediation.IsInitialized || string.IsNullOrEmpty(placementId))
            {
                return;
            }
            
            if (_adInstances.TryGetValue(placementId, out var instance))
            {
                instance.Destroy();
                _adInstances.Remove(placementId);
                Logger.Log($"Banner destroyed: {placementId}");
            }
        }
        
        private static IEnumerator CreateCoroutine(string placementId, BannerSize size, BannerPosition position, Action<AdError> onLoaded)
        {
            // Request bid from auction
            AdResponse response = null;
            AdError error = null;
            bool requestComplete = false;
            
            yield return MediationSDK.Instance.AuctionClient.RequestBid(
                placementId,
                AdType.Banner,
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
                Logger.LogError($"Failed to load banner: {error}");
                onLoaded?.Invoke(error);
                yield break;
            }
            
            // Create banner instance
            var instance = new BannerAdInstance(placementId, response, size, position);
            _adInstances[placementId] = instance;
            
            Logger.Log($"Banner created: {placementId}");
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
    /// Internal class representing a banner ad instance
    /// </summary>
    internal class BannerAdInstance
    {
        private readonly string _placementId;
        private readonly AdResponse _response;
        private readonly ApexBanner.BannerSize _size;
        private readonly ApexBanner.BannerPosition _position;
        private GameObject _bannerObject;
        private bool _isVisible;
        
        public BannerAdInstance(string placementId, AdResponse response, ApexBanner.BannerSize size, ApexBanner.BannerPosition position)
        {
            _placementId = placementId;
            _response = response;
            _size = size;
            _position = position;
            _isVisible = false;
            
            CreateBannerUI();
        }
        
        private void CreateBannerUI()
        {
            // TODO: Create actual UI Canvas with banner creative
            // For now, create placeholder GameObject
            _bannerObject = new GameObject($"ApexBanner_{_placementId}");
            GameObject.DontDestroyOnLoad(_bannerObject);
            _bannerObject.SetActive(false);
            
            Logger.Log($"[MOCK] Banner UI created at {_position} with size {_size}");
        }
        
        public void Show()
        {
            if (_bannerObject != null)
            {
                _bannerObject.SetActive(true);
                _isVisible = true;
                Logger.Log($"[MOCK] Banner visible: {_response.creative_url}");
            }
        }
        
        public void Hide()
        {
            if (_bannerObject != null)
            {
                _bannerObject.SetActive(false);
                _isVisible = false;
                Logger.Log($"[MOCK] Banner hidden");
            }
        }
        
        public void Destroy()
        {
            if (_bannerObject != null)
            {
                GameObject.Destroy(_bannerObject);
                _bannerObject = null;
                Logger.Log($"[MOCK] Banner destroyed");
            }
        }
    }
}
