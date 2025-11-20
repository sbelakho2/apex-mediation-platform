using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.Linq;

namespace Apex.Mediation.Adapters
{
    public static class AdapterCatalog
    {
        private static readonly IReadOnlyDictionary<string, AdapterMetadata> Catalog;

        static AdapterCatalog()
        {
            var entries = new[]
            {
                new AdapterMetadata(
                    "AdMob",
                    new[] { "app_id", "ad_unit_id" },
                    new[] { "google.com, pub-xxxxxxxxxxxxxxxx, DIRECT, f08c47fec0942fa0" },
                    "https://developers.google.com/admob/unity/quick-start"),
                new AdapterMetadata(
                    "AppLovin",
                    new[] { "sdk_key", "ad_unit_id" },
                    new[] { "applovin.com, 1234567890abcdef1234567890abcdef, DIRECT" },
                    "https://dash.applovin.com/documentation/mediation/unity/getting-started"),
                new AdapterMetadata(
                    "ironSource",
                    new[] { "app_key", "placement_name" },
                    new[] { "ironsrc.com, 123456789, DIRECT" },
                    "https://developers.is.com/ironsource-mobile/unity/unity-plugin-installation/"),
                new AdapterMetadata(
                    "UnityAds",
                    new[] { "game_id", "placement_id" },
                    new[] { "unityads.unity3d.com, 1234567, DIRECT" },
                    "https://unity.com/solutions/gaming/operate/monetization"),
                new AdapterMetadata(
                    "MockAdapter",
                    new[] { "api_key" },
                    new[] { "mocknetwork.example, 000000, DIRECT" },
                    "https://docs.example.com/mock")
            };

            Catalog = new ReadOnlyDictionary<string, AdapterMetadata>(entries.ToDictionary(e => e.Name));
        }

        public static bool TryGet(string network, out AdapterMetadata metadata)
        {
            if (string.IsNullOrWhiteSpace(network))
            {
                metadata = null!;
                return false;
            }

            return Catalog.TryGetValue(network, out metadata!);
        }

        public static IEnumerable<AdapterMetadata> AllAdapters() => Catalog.Values;
    }
}
