using System;

namespace Apex.Mediation.Core
{
    public enum AdEventType
    {
        Loaded,
        FailedToLoad,
        Shown,
        Clicked,
        Closed,
        Paid
    }

    public sealed class AdEventArgs : EventArgs
    {
        public AdEventArgs(string placementId, AdEventType type, string adapter, string? message = null)
        {
            PlacementId = placementId;
            Type = type;
            Adapter = adapter;
            Message = message;
        }

        public string PlacementId { get; }
        public AdEventType Type { get; }
        public string Adapter { get; }
        public string? Message { get; }
    }

    public sealed class PaidEventArgs : EventArgs
    {
        public PaidEventArgs(string placementId, string adapter, decimal value, string currency)
        {
            PlacementId = placementId;
            Adapter = adapter;
            ValueMicros = value;
            CurrencyCode = currency;
        }

        public string PlacementId { get; }
        public string Adapter { get; }
        public decimal ValueMicros { get; }
        public string CurrencyCode { get; }
    }
}
