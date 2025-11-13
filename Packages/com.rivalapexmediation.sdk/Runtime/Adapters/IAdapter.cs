using System.Collections.Generic;

namespace RivalApex.Mediation.Adapters
{
    /// <summary>
    /// Lightweight adapter interface for Unity runtime.
    /// This is a metadata/stub interface used for sandbox readiness.
    /// </summary>
    public interface IAdapter
    {
        string NetworkName { get; }
        string Version { get; }
        bool Supports(AdType type);
        void Initialize(IDictionary<string, string> config);
        bool TryLoad(string placementId, AdType type, out object ad);
    }
}
