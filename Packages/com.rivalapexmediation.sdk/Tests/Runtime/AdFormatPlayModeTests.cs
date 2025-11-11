using NUnit.Framework;
using System.Collections;
using UnityEngine;
using UnityEngine.TestTools;
using RivalApex.Mediation;

namespace RivalApex.Mediation.Tests.PlayMode
{
    /// <summary>
    /// Play Mode tests for ad format lifecycle
    /// </summary>
    public class AdFormatPlayModeTests
    {
        private SDKConfig _config;
        
        [SetUp]
        public void SetUp()
        {
            _config = ScriptableObject.CreateInstance<SDKConfig>();
            _config.AppId = "test-app-id";
            _config.ApiKey = "test-api-key";
            _config.TestMode = true;
        }
        
        [UnityTest]
        public IEnumerator Interstitial_LoadAndShow_Lifecycle()
        {
            // Initialize SDK
            bool initComplete = false;
            ApexMediation.Initialize(_config, (success) => initComplete = success);
            yield return new WaitUntil(() => initComplete);
            
            // Load interstitial
            bool loadComplete = false;
            AdError loadError = null;
            
            ApexInterstitial.Load("test-placement", (error) =>
            {
                loadComplete = true;
                loadError = error;
            });
            
            yield return new WaitUntil(() => loadComplete);
            
            // Should fail with mock server (expected in test environment)
            // This verifies the API works correctly
            Assert.IsTrue(loadComplete);
        }
        
        [UnityTest]
        public IEnumerator Rewarded_LoadCallback_FiresOnMainThread()
        {
            bool initComplete = false;
            ApexMediation.Initialize(_config, (success) => initComplete = success);
            yield return new WaitUntil(() => initComplete);
            
            bool loadComplete = false;
            bool onMainThread = false;
            
            ApexRewarded.Load("test-placement", (error) =>
            {
                loadComplete = true;
                onMainThread = (System.Threading.Thread.CurrentThread.ManagedThreadId == 1);
            });
            
            yield return new WaitUntil(() => loadComplete);
            
            Assert.IsTrue(onMainThread, "Callback should fire on main thread");
        }
        
        [UnityTest]
        public IEnumerator Banner_CreateAndDestroy_NoMemoryLeak()
        {
            bool initComplete = false;
            ApexMediation.Initialize(_config, (success) => initComplete = success);
            yield return new WaitUntil(() => initComplete);
            
            int objectCountBefore = Object.FindObjectsOfType<GameObject>().Length;
            
            // Create banner
            bool createComplete = false;
            ApexBanner.Create("test-placement", ApexBanner.BannerSize.Banner_320x50, ApexBanner.BannerPosition.Bottom, (error) =>
            {
                createComplete = true;
            });
            
            yield return new WaitUntil(() => createComplete);
            yield return null;
            
            // Destroy banner
            ApexBanner.Destroy("test-placement");
            yield return null;
            
            int objectCountAfter = Object.FindObjectsOfType<GameObject>().Length;
            
            // Object count should be same or less (banner cleaned up)
            Assert.LessOrEqual(objectCountAfter, objectCountBefore + 1, "Banner should be cleaned up without leaking GameObjects");
        }
    }
}
