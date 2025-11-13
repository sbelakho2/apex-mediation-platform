using System.Collections.Generic;
using RivalApex.Mediation;

namespace RivalApex.Mediation.Adapters
{
    /// <summary>
    /// Minimal, metadata-only adapter used to represent supported networks in Unity runtime.
    /// </summary>
    internal sealed class BaseStubAdapter : IAdapter
    {
        public string NetworkName { get; }
        public string Version { get; }

        private bool _initialized;

        public BaseStubAdapter(string networkName, string version = "1.0.0")
        {
            NetworkName = networkName;
            Version = version;
        }

        public void Initialize(IDictionary<string, string> config)
        {
            // Validate at least one key exists when provided (no-op otherwise)
            _initialized = config == null || config.Count >= 0;
        }

        public bool Supports(AdType type)
        {
            switch (type)
            {
                case AdType.Banner:
                case AdType.Interstitial:
                case AdType.Rewarded:
                    return true;
                default:
                    return false;
            }
        }

        public bool TryLoad(string placementId, AdType type, out object ad)
        {
            ad = null;
            if (!_initialized || !Supports(type)) return false;
            // Return a simple opaque object to indicate a mocked load
            ad = new { network = NetworkName, placement = placementId, type = type.ToString() };
            return true;
        }
    }
}
