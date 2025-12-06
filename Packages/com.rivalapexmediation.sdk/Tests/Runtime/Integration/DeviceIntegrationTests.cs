using System.Collections;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.TestTools;

namespace RivalApex.Mediation.Tests.Integration
{
    /// <summary>
    /// Lightweight smoke tests that run on device/emulator builds to verify initialization completes.
    /// Skipped automatically when executed on unsupported platforms.
    /// </summary>
    public class DeviceIntegrationTests
    {
        [UnityTest]
        [UnityPlatform(RuntimePlatform.Android, RuntimePlatform.IPhonePlayer)]
        public IEnumerator Mobile_Initialize_CompletesWithinTimeout()
        {
            ResetMediationSingleton();

            var config = ScriptableObject.CreateInstance<SDKConfig>();
            config.AppId = "device-test-app";
            config.ApiKey = "device-test-key";
            config.AuctionEndpoint = "https://api.apexmediation.ee/v1";
            config.EnablePerformanceBudgetChecks = true;
            config.RemoteConfigTimeoutMs = 1000;

            bool callbackInvoked = false;
            bool success = false;

            ApexMediation.Initialize(config, result =>
            {
                callbackInvoked = true;
                success = result;
            });

            var timeout = Time.realtimeSinceStartup + 5f;
            while (!callbackInvoked && Time.realtimeSinceStartup < timeout)
            {
                yield return null;
            }

            Assert.IsTrue(callbackInvoked, "Initialization callback did not fire within 5 seconds on device");
            Assert.IsTrue(success, "Initialization failed on device/emulator build");
            Assert.IsTrue(ApexMediation.IsInitialized, "SDK should report initialized after success");
        }

        [UnityTest]
        [UnityPlatform(RuntimePlatform.Android, RuntimePlatform.IPhonePlayer)]
        public IEnumerator Mobile_PlatformBridge_Provides_DeviceMetadata()
        {
            if (!ApexMediation.IsInitialized)
            {
                yield return Mobile_Initialize_CompletesWithinTimeout();
            }

            var bridge = MediationSDK.Instance.PlatformBridge;
            Assert.IsFalse(string.IsNullOrEmpty(bridge.PlatformName));
            Assert.IsFalse(string.IsNullOrEmpty(bridge.GetDeviceId()), "Device identifier should be available on mobile builds");
            yield break;
        }

        private static void ResetMediationSingleton()
        {
            var existing = Object.FindObjectOfType<MediationSDK>();
            if (existing != null)
            {
                Object.DestroyImmediate(existing.gameObject);
            }
        }
    }
}
