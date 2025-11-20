using System;

namespace Apex.Mediation.Core
{
    internal sealed class RenderableAd
    {
        private bool _shown;

        public RenderableAd(string placementId, string adapter, TimeSpan ttl)
        {
            PlacementId = placementId;
            Adapter = adapter;
            Ttl = ttl;
            LoadedAt = DateTime.UtcNow;
        }

        public string PlacementId { get; }
        public string Adapter { get; }
        public TimeSpan Ttl { get; }
        public DateTime LoadedAt { get; }

        public bool IsExpired => DateTime.UtcNow - LoadedAt > Ttl;

        public bool TryMarkShown()
        {
            if (_shown || IsExpired)
            {
                return false;
            }

            _shown = true;
            return true;
        }
    }
}
