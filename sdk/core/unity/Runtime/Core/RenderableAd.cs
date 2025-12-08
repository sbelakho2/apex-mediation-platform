using System;

namespace Apex.Mediation.Core
{
    internal sealed class RenderableAd
    {
        private bool _shown;
        private readonly IClock _clock;

        public RenderableAd(string placementId, string adapter, TimeSpan ttl, IClock? clock = null)
        {
            PlacementId = placementId;
            Adapter = adapter;
            Ttl = ttl;
            _clock = clock ?? MonotonicClock.Instance;
            LoadedAt = _clock.Now;
        }

        public string PlacementId { get; }
        public string Adapter { get; }
        public TimeSpan Ttl { get; }
        public TimeSpan LoadedAt { get; }

        public bool IsExpired => _clock.Now - LoadedAt > Ttl;

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
