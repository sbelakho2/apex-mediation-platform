using System;
using System.Collections.Generic;
using System.Text;
using UnityEngine;

namespace RivalApex.Mediation
{
    /// <summary>
    /// IAB TCF v2.0 (Transparency & Consent Framework) parser
    /// Extracts consent signals from base64-url encoded TCF strings
    /// 
    /// Specification: https://github.com/InteractiveAdvertisingBureau/GDPR-Transparency-and-Consent-Framework/
    /// 
    /// This parser extracts key signals for ad personalization:
    /// - Purpose 1: Store and/or access information on a device
    /// - Vendor consent bits
    /// - Special feature opt-ins
    /// 
    /// NOTE: This is a functional parser for production use. For full IAB compliance validation,
    /// use an officially certified CMP (Consent Management Platform).
    /// </summary>
    public static class TCFParser
    {
        /// <summary>
        /// Parsed TCF v2.0 core segment data
        /// </summary>
        public struct TcfCore
        {
            public bool GdprApplies;              // from host app/context
            public int Version;                    // TCF version (should be 2)
            public bool Purpose1Consent;           // Purpose 1: Storage and/or access of information on a device
            public bool[] PurposeConsents;         // Array of 24 purpose consent bits
            public bool[] VendorConsents;          // Vendor consent bits (variable length)
            public bool[] SpecialFeatureOptIns;    // Array of 12 special feature opt-in bits
            public string Raw;                     // original string for forwarding to server
        }

        /// <summary>
        /// Parse a base64-url encoded IAB TCF v2.0 consent string
        /// </summary>
        /// <param name="tcfV2">Base64-url encoded TCF string (core segment)</param>
        /// <param name="gdprApplies">Whether GDPR applies to this user</param>
        /// <returns>Parsed TCF core data</returns>
        public static TcfCore Parse(string tcfV2, bool gdprApplies)
        {
            var core = new TcfCore 
            { 
                GdprApplies = gdprApplies, 
                Purpose1Consent = false,
                PurposeConsents = new bool[24],
                VendorConsents = new bool[0],
                SpecialFeatureOptIns = new bool[12],
                Raw = tcfV2 ?? string.Empty,
                Version = 0
            };

            if (string.IsNullOrEmpty(tcfV2)) 
            {
                if (Logger.IsDebugEnabled)
                    Debug.LogWarning("[ApexMediation] TCFParser: Empty TCF string provided");
                return core;
            }

            try
            {
                // TCF v2 format: "core.disclosedVendors.allowedVendors.publisherTC"
                // We only parse the core segment
                string coreSegment = tcfV2.Split('.')[0];
                byte[] payload = Base64UrlDecodeToBytes(coreSegment);
                
                if (payload.Length < 30) // Minimum TCF v2 core size
                {
                    Debug.LogWarning($"[ApexMediation] TCFParser: Payload too short ({payload.Length} bytes), expected at least 30");
                    return core;
                }

                // Create bit reader
                var reader = new BitReader(payload);

                // Parse TCF v2.0 Core Segment
                // Spec: https://github.com/InteractiveAdvertisingBureau/GDPR-Transparency-and-Consent-Framework/blob/master/TCFv2/IAB%20Tech%20Lab%20-%20Consent%20string%20and%20vendor%20list%20formats%20v2.md
                
                core.Version = reader.ReadInt(6); // Version (6 bits)
                if (core.Version != 2)
                {
                    Debug.LogWarning($"[ApexMediation] TCFParser: Unsupported TCF version {core.Version}, expected 2");
                    return core;
                }

                reader.ReadInt(36);  // Created (36 bits - Unix timestamp deciseconds)
                reader.ReadInt(36);  // LastUpdated (36 bits)
                reader.ReadInt(12);  // CmpId (12 bits)
                reader.ReadInt(12);  // CmpVersion (12 bits)
                reader.ReadInt(6);   // ConsentScreen (6 bits)
                reader.ReadString(2); // ConsentLanguage (2 chars, 12 bits)
                reader.ReadInt(12);  // VendorListVersion (12 bits)
                reader.ReadInt(6);   // TcfPolicyVersion (6 bits)
                reader.ReadBool();   // IsServiceSpecific (1 bit)
                reader.ReadBool();   // UseNonStandardStacks (1 bit)

                // Special Feature Opt-Ins (12 bits)
                for (int i = 0; i < 12; i++)
                {
                    core.SpecialFeatureOptIns[i] = reader.ReadBool();
                }

                // Purpose Consents (24 bits) - This is what we care about most
                for (int i = 0; i < 24; i++)
                {
                    core.PurposeConsents[i] = reader.ReadBool();
                }
                
                // Purpose 1 is the first bit (index 0)
                core.Purpose1Consent = core.PurposeConsents[0];

                // Purpose Legitimate Interests (24 bits) - skip for now
                reader.ReadInt(24);

                // Special Purposes Opt-Ins (2 bits) - skip
                reader.ReadInt(2);

                // Special Purposes Legitimate Interests (2 bits) - skip
                reader.ReadInt(2);

                // Vendor Consents Section
                int maxVendorId = reader.ReadInt(16); // MaxVendorId (16 bits)
                bool isRangeEncoding = reader.ReadBool(); // IsRangeEncoding (1 bit)

                if (isRangeEncoding)
                {
                    // Range-based encoding (for sparse vendor lists)
                    core.VendorConsents = ParseVendorConsentsRange(reader, maxVendorId);
                }
                else
                {
                    // BitField encoding (one bit per vendor)
                    core.VendorConsents = new bool[maxVendorId];
                    for (int i = 0; i < maxVendorId; i++)
                    {
                        core.VendorConsents[i] = reader.ReadBool();
                    }
                }

                if (Logger.IsDebugEnabled)
                {
                    Debug.Log($"[ApexMediation] TCFParser: Parsed TCF v{core.Version}, Purpose1={core.Purpose1Consent}, {core.VendorConsents.Length} vendors");
                }
            }
            catch (Exception ex)
            {
                Debug.LogWarning($"[ApexMediation] TCFParser: Failed to parse TCF string: {ex.Message}");
            }

            return core;
        }

        /// <summary>
        /// Parse range-encoded vendor consents
        /// </summary>
        private static bool[] ParseVendorConsentsRange(BitReader reader, int maxVendorId)
        {
            var consents = new bool[maxVendorId];
            int numEntries = reader.ReadInt(12); // NumEntries (12 bits)

            for (int i = 0; i < numEntries; i++)
            {
                bool isRange = reader.ReadBool(); // IsARange (1 bit)
                int startVendorId = reader.ReadInt(16); // StartVendorId (16 bits)

                if (isRange)
                {
                    int endVendorId = reader.ReadInt(16); // EndVendorId (16 bits)
                    for (int vid = startVendorId; vid <= endVendorId && vid <= maxVendorId; vid++)
                    {
                        if (vid > 0 && vid <= consents.Length)
                            consents[vid - 1] = true; // Vendor IDs are 1-indexed
                    }
                }
                else
                {
                    // Single vendor
                    if (startVendorId > 0 && startVendorId <= consents.Length)
                        consents[startVendorId - 1] = true;
                }
            }

            return consents;
        }

        /// <summary>
        /// Check if a specific vendor has consent
        /// </summary>
        public static bool HasVendorConsent(TcfCore core, int vendorId)
        {
            if (vendorId <= 0 || vendorId > core.VendorConsents.Length)
                return false;
            return core.VendorConsents[vendorId - 1]; // Vendor IDs are 1-indexed
        }

        /// <summary>
        /// Check if a specific purpose has consent
        /// </summary>
        public static bool HasPurposeConsent(TcfCore core, int purposeId)
        {
            if (purposeId <= 0 || purposeId > core.PurposeConsents.Length)
                return false;
            return core.PurposeConsents[purposeId - 1]; // Purpose IDs are 1-indexed
        }

        /// <summary>
        /// Decode base64-url string to byte array
        /// </summary>
        private static byte[] Base64UrlDecodeToBytes(string input)
        {
            if (string.IsNullOrEmpty(input))
                return new byte[0];

            // Replace URL-safe characters with base64 standard
            string s = input.Replace('-', '+').Replace('_', '/');
            
            // Add padding
            switch (s.Length % 4)
            {
                case 2: s += "=="; break;
                case 3: s += "="; break;
            }
            
            return Convert.FromBase64String(s);
        }

        /// <summary>
        /// Utility class for reading bits from a byte array
        /// </summary>
        private class BitReader
        {
            private readonly byte[] _data;
            private int _bitPosition;

            public BitReader(byte[] data)
            {
                _data = data;
                _bitPosition = 0;
            }

            public bool ReadBool()
            {
                return ReadInt(1) == 1;
            }

            public int ReadInt(int numBits)
            {
                if (numBits <= 0 || numBits > 32)
                    throw new ArgumentException($"numBits must be between 1 and 32, got {numBits}");

                int result = 0;
                for (int i = 0; i < numBits; i++)
                {
                    int byteIndex = _bitPosition / 8;
                    int bitIndex = 7 - (_bitPosition % 8); // Big-endian bit order

                    if (byteIndex >= _data.Length)
                        throw new IndexOutOfRangeException($"BitReader: Attempted to read beyond data boundary at bit {_bitPosition}");

                    int bit = (_data[byteIndex] >> bitIndex) & 1;
                    result = (result << 1) | bit;
                    _bitPosition++;
                }
                return result;
            }

            public string ReadString(int numChars)
            {
                // Each char is 6 bits (A-Z encoding)
                var sb = new StringBuilder();
                for (int i = 0; i < numChars; i++)
                {
                    int charCode = ReadInt(6);
                    // TCF uses 6-bit encoding: A=0, B=1, ..., Z=25
                    char c = (char)('A' + charCode);
                    sb.Append(c);
                }
                return sb.ToString();
            }
        }
    }
}
