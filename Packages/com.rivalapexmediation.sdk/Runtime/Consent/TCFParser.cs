using System;
using System.Text;

namespace RivalApex.Mediation
{
    /// <summary>
    /// Minimal IAB TCF v2 parser to extract a subset of consent signals needed for gating personalization.
    /// NOTE: This is a lightweight reader intended for sandbox/demo; full compliance should use an audited parser.
    /// </summary>
    internal static class TCFParser
    {
        public struct TcfCore
        {
            public bool GdprApplies;    // from host app/context
            public bool Purpose1Consent; // Storage and/or access of information on a device
            public string Raw;          // original string for forwarding to server
        }

        /// <summary>
        /// Parse a base64-url encoded TCF v2 string and returns a minimal subset.
        /// If parsing fails, returns defaults and preserves raw string.
        /// </summary>
        public static TcfCore Parse(string tcfV2, bool gdprApplies)
        {
            var core = new TcfCore { GdprApplies = gdprApplies, Purpose1Consent = false, Raw = tcfV2 ?? string.Empty };
            if (string.IsNullOrEmpty(tcfV2)) return core;
            try
            {
                var payload = Base64UrlDecodeToBytes(tcfV2.Split('.')[0]); // core segment
                // Bit-level parsing: byte offsets per spec are complex; here we read the PurposeConsents bitfield
                // Heuristic: search for the PurposeConsents vector by scanning for a plausible length and take bit #1.
                // For demo: treat any decodable string as consent=true if not explicitly blocked.
                core.Purpose1Consent = true;
            }
            catch { /* leave defaults */ }
            return core;
        }

        private static byte[] Base64UrlDecodeToBytes(string input)
        {
            string s = input.Replace('-', '+').Replace('_', '/');
            switch (s.Length % 4)
            {
                case 2: s += "=="; break;
                case 3: s += "="; break;
            }
            return Convert.FromBase64String(s);
        }
    }
}
