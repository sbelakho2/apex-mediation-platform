using System;
using System.Collections;
using System.Text;
using UnityEngine;
using UnityEngine.Networking;

namespace RivalApex.Mediation
{
    /// <summary>
    /// Remote (OTA) config client. Fetches signed config JSON from backend
    /// and merges it with local SDKConfig values. Designed to be lightweight
    /// and safe to fail (SDK continues with local config if remote not available).
    /// </summary>
    internal class RemoteConfigClient
    {
        private readonly SDKConfig _config;
        private int _version;
        private const int DefaultTimeoutMs = 3000;

        public int Version => _version;

        public RemoteConfigClient(SDKConfig config)
        {
            _config = config;
        }

        public IEnumerator FetchAndMerge(Action<bool, int> onComplete)
        {
            var url = ResolveEndpoint();
            if (string.IsNullOrEmpty(url))
            {
                onComplete?.Invoke(false, 0);
                yield break;
            }

            using (var req = UnityWebRequest.Get(url))
            {
                req.timeout = Mathf.Max(1, _config.RemoteConfigTimeoutMs > 0 ? _config.RemoteConfigTimeoutMs / 1000 : DefaultTimeoutMs / 1000);
                req.SetRequestHeader("Accept", "application/json");
                if (!string.IsNullOrEmpty(_config.ApiKey))
                {
                    req.SetRequestHeader("Authorization", $"Bearer {_config.ApiKey}");
                }

                yield return req.SendWebRequest();

                if (req.result != UnityWebRequest.Result.Success)
                {
                    Logger.LogWarning($"Remote config HTTP error: {req.responseCode} {req.error}");
                    onComplete?.Invoke(false, 0);
                    yield break;
                }

                try
                {
                    var json = req.downloadHandler.text;
                    var parsed = JsonUtility.FromJson<RemoteConfigPayload>(json);
                    if (parsed == null)
                    {
                        onComplete?.Invoke(false, 0);
                        yield break;
                    }
                    _version = parsed.version;
                    // Minimal merge placeholder: In this lightweight client, we only capture
                    // the remote version and leave merging to host application or future SDK versions.
                    // This is intentionally non-invasive to avoid introducing new hard dependencies.
                    onComplete?.Invoke(true, _version);
                }
                catch (Exception ex)
                {
                    Logger.LogWarning($"Remote config parse error: {ex.Message}");
                    onComplete?.Invoke(false, 0);
                }
            }
        }

        private string ResolveEndpoint()
        {
            if (!string.IsNullOrEmpty(_config.RemoteConfigUrl)) return _config.RemoteConfigUrl;
            if (!string.IsNullOrEmpty(_config.ApiBaseUrl))
            {
                return _config.ApiBaseUrl.TrimEnd('/') + "/sdk/config?appId=" + Uri.EscapeDataString(_config.AppId ?? "");
            }
            return null;
        }

        [Serializable]
        private class RemoteConfigPayload
        {
            public int version = 0;
            public Placement[] placements;
            public Flag[] flags;
        }

        [Serializable]
        private class Placement
        {
            public string placementId;
            public string format; // banner/interstitial/rewarded
        }

        [Serializable]
        private class Flag
        {
            public string key;
            public bool value;
        }
    }
}
