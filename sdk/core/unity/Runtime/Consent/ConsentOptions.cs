using System;
using System.Collections.Generic;

namespace Apex.Mediation.Consent
{
    [Serializable]
    public sealed class ConsentOptions
    {
        public bool? GdprApplies { get; set; }
        public string? TcfString { get; set; }
        public string? GppString { get; set; }
        public string? UsPrivacyString { get; set; }
        public bool? CoppaApplies { get; set; }
        public string? AttStatus { get; set; }
        public bool? LimitAdTracking { get; set; }

        public Dictionary<string, object?> AsAdapterMap()
        {
            var map = new Dictionary<string, object?>();
            if (GdprApplies.HasValue) map["gdpr"] = GdprApplies.Value;
            if (!string.IsNullOrEmpty(TcfString)) map["tcf"] = TcfString;
            if (!string.IsNullOrEmpty(GppString)) map["gpp"] = GppString;
            if (!string.IsNullOrEmpty(UsPrivacyString)) map["usp"] = UsPrivacyString;
            if (CoppaApplies.HasValue) map["coppa"] = CoppaApplies.Value;
            if (!string.IsNullOrEmpty(AttStatus)) map["attStatus"] = AttStatus;
            if (LimitAdTracking.HasValue) map["lat"] = LimitAdTracking.Value;
            return map;
        }

        public ConsentOptions Clone()
        {
            return (ConsentOptions)MemberwiseClone();
        }
    }
}
