using System;
using System.Collections;
using UnityEngine;

namespace ApexMediation
{
    public class Mediation : MonoBehaviour
    {
        private static Mediation _instance;
        private bool _initialized;

        public static Mediation Instance
        {
            get
            {
                if (_instance == null)
                {
                    var go = new GameObject("ApexMediation");
                    DontDestroyOnLoad(go);
                    _instance = go.AddComponent<Mediation>();
                }

                return _instance;
            }
        }

        public void Initialize(string apiKey, Action<bool> callback)
        {
            if (string.IsNullOrEmpty(apiKey))
            {
                callback?.Invoke(false);
                return;
            }

            StartCoroutine(InitializeCoroutine(callback));
        }

        private IEnumerator InitializeCoroutine(Action<bool> callback)
        {
            yield return new WaitForSeconds(0.25f);
            _initialized = true;
            callback?.Invoke(true);
        }

        public void RequestInterstitial(string placementId, Action<AdFill> callback)
        {
            if (!_initialized)
            {
                callback?.Invoke(null);
                return;
            }

            if (string.IsNullOrEmpty(placementId))
            {
                callback?.Invoke(null);
                return;
            }

            var fill = new AdFill
            {
                Adapter = "admob",
                Ecpm = 12.3,
                CreativeUrl = "https://ads.apexmediation.com/interstitial.mp4"
            };

            callback?.Invoke(fill);
        }
    }

    [Serializable]
    public class AdFill
    {
        public string Adapter;
        public double Ecpm;
        public string CreativeUrl;
    }
}
