using System.Collections.Generic;
using System.Linq;

namespace RivalApex.Mediation.Adapters
{
    /// <summary>
    /// Registry exposing the set of supported ad network adapters (stubs) in Unity.
    /// </summary>
    public static class AdapterRegistry
    {
        private static readonly string[] Names = new[]
        {
            "admob",
            "applovin",
            "unity",
            "ironsource",
            "facebook",
            "vungle",
            "chartboost",
            "pangle",
            "mintegral",
            "adcolony",
            "tapjoy",
            "moloco",
            "fyber",
            "smaato",
            "amazon"
        };

        private static readonly IReadOnlyDictionary<string, IAdapter> _adapters =
            Names.ToDictionary(n => n, n => (IAdapter)new BaseStubAdapter(n));

        /// <summary>
        /// Returns a copy of supported network names.
        /// </summary>
        public static string[] GetSupportedNetworks() => Names.ToArray();

        /// <summary>
        /// Returns adapters keyed by network name.
        /// </summary>
        public static IReadOnlyDictionary<string, IAdapter> GetAdapters() => _adapters;

        /// <summary>
        /// Returns the adapter instance for a given network name, or null.
        /// </summary>
        public static IAdapter Get(string network)
        {
            return _adapters.TryGetValue(network, out var a) ? a : null;
        }
    }
}
