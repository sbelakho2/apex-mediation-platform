using NUnit.Framework;
using System.Collections;
using UnityEngine;
using UnityEngine.TestTools;
using RivalApex.Mediation;

namespace RivalApex.Mediation.Tests.PlayMode
{
    /// <summary>
    /// Play Mode tests for SDK initialization and lifecycle
    /// </summary>
    public class SDKInitializationPlayModeTests
    {
        private GameObject _testGameObject;
        
        [SetUp]
        public void SetUp()
        {
            _testGameObject = new GameObject("TestRunner");
        }
        
        [TearDown]
        public void TearDown()
        {
            if (_testGameObject != null)
            {
                Object.DestroyImmediate(_testGameObject);
            }
        }
        
        [UnityTest]
        public IEnumerator SDK_Initialize_CreatesSDKGameObject()
        {
            var config = ScriptableObject.CreateInstance<SDKConfig>();
            config.AppId = "test-app-id";
            config.ApiKey = "test-api-key";
            
            bool initComplete = false;
            bool initSuccess = false;
            
            ApexMediation.Initialize(config, (success) =>
            {
                initComplete = true;
                initSuccess = success;
            });
            
            // Wait for initialization
            yield return new WaitUntil(() => initComplete);
            
            Assert.IsTrue(initSuccess);
            Assert.IsTrue(ApexMediation.IsInitialized);
            
            // Verify SDK GameObject exists
            var sdkObject = GameObject.Find("ApexMediationSDK");
            Assert.IsNotNull(sdkObject);
        }
        
        [UnityTest]
        public IEnumerator SDK_Initialize_WithInvalidConfig_Fails()
        {
            var config = ScriptableObject.CreateInstance<SDKConfig>();
            // Leave AppId and ApiKey empty (invalid)
            
            bool initComplete = false;
            bool initSuccess = true; // Should become false
            
            ApexMediation.Initialize(config, (success) =>
            {
                initComplete = true;
                initSuccess = success;
            });
            
            yield return new WaitUntil(() => initComplete);
            
            Assert.IsFalse(initSuccess);
        }
        
        [UnityTest]
        public IEnumerator SDK_Initialize_IsIdempotent()
        {
            var config = ScriptableObject.CreateInstance<SDKConfig>();
            config.AppId = "test-app-id";
            config.ApiKey = "test-api-key";
            
            int callbackCount = 0;
            
            ApexMediation.Initialize(config, (_) => callbackCount++);
            yield return new WaitForSeconds(0.5f);
            
            ApexMediation.Initialize(config, (_) => callbackCount++);
            yield return new WaitForSeconds(0.5f);
            
            // Second init should complete immediately (idempotent)
            Assert.AreEqual(2, callbackCount);
        }
        
        [UnityTest]
        public IEnumerator SDK_SurvivesSceneTransition()
        {
            var config = ScriptableObject.CreateInstance<SDKConfig>();
            config.AppId = "test-app-id";
            config.ApiKey = "test-api-key";
            
            bool initComplete = false;
            ApexMediation.Initialize(config, (_) => initComplete = true);
            yield return new WaitUntil(() => initComplete);
            
            var sdkObject = GameObject.Find("ApexMediationSDK");
            Assert.IsNotNull(sdkObject);
            
            // Simulate scene change by destroying all non-DontDestroyOnLoad objects
            var allObjects = Object.FindObjectsOfType<GameObject>();
            foreach (var obj in allObjects)
            {
                if (obj != sdkObject && obj.scene.name != null)
                {
                    Object.Destroy(obj);
                }
            }
            
            yield return null;
            
            // SDK object should still exist
            var sdkObjectAfter = GameObject.Find("ApexMediationSDK");
            Assert.IsNotNull(sdkObjectAfter);
            Assert.IsTrue(ApexMediation.IsInitialized);
        }
    }
}
