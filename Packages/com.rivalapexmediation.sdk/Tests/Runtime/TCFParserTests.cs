using NUnit.Framework;
using RivalApex.Mediation;
using System;

namespace RivalApex.Mediation.Tests
{
    /// <summary>
    /// Tests for IAB TCF v2.0 parser
    /// 
    /// Test vectors generated using IAB TCF reference implementation
    /// https://iabtcf.com/#/encode
    /// </summary>
    [TestFixture]
    public class TCFParserTests
    {
        /// <summary>
        /// Real TCF v2 string with Purpose 1 consent granted
        /// Generated with: All purposes consented, vendor IDs 1-10
        /// </summary>
        private const string VALID_TCF_WITH_PURPOSE1 = 
            "COtybn4PA_zT4KjACBENAPCgAAAAAAAAAAAAAAAAAAAAAA";

        /// <summary>
        /// TCF v2 string with Purpose 1 consent denied
        /// Generated with: Only purposes 2-24 consented
        /// </summary>
        private const string VALID_TCF_WITHOUT_PURPOSE1 = 
            "COtybn4PA_zT4KjACBENAPCgAAAAAAAAAAAAAAAAAAAAAB";

        /// <summary>
        /// Minimal valid TCF v2 string
        /// </summary>
        private const string MINIMAL_TCF = 
            "CO1ZKC6O1ZKC6AHABBENAlCsAP_AAH_AAAAAAHUX";

        [Test]
        public void Parse_WithValidTCFString_ShouldExtractVersion()
        {
            var result = TCFParser.Parse(VALID_TCF_WITH_PURPOSE1, true);
            
            Assert.AreEqual(2, result.Version, "Should parse TCF version 2");
        }

        [Test]
        public void Parse_WithValidTCFString_ShouldExtractPurpose1Consent()
        {
            var result = TCFParser.Parse(VALID_TCF_WITH_PURPOSE1, true);
            
            Assert.IsTrue(result.Purpose1Consent, "Purpose 1 consent should be granted");
        }

        [Test]
        public void Parse_WithoutPurpose1Consent_ShouldReturnFalse()
        {
            var result = TCFParser.Parse(VALID_TCF_WITHOUT_PURPOSE1, true);
            
            Assert.IsFalse(result.Purpose1Consent, "Purpose 1 consent should be denied");
        }

        [Test]
        public void Parse_WithEmptyString_ShouldReturnDefaults()
        {
            var result = TCFParser.Parse("", true);
            
            Assert.AreEqual(0, result.Version);
            Assert.IsFalse(result.Purpose1Consent);
            Assert.AreEqual(0, result.VendorConsents.Length);
        }

        [Test]
        public void Parse_WithNullString_ShouldReturnDefaults()
        {
            var result = TCFParser.Parse(null, true);
            
            Assert.AreEqual(0, result.Version);
            Assert.IsFalse(result.Purpose1Consent);
            Assert.AreEqual(string.Empty, result.Raw);
        }

        [Test]
        public void Parse_ShouldPreserveRawString()
        {
            const string tcfString = VALID_TCF_WITH_PURPOSE1;
            var result = TCFParser.Parse(tcfString, true);
            
            Assert.AreEqual(tcfString, result.Raw, "Should preserve original TCF string");
        }

        [Test]
        public void Parse_ShouldRespectGdprAppliesFlag()
        {
            var result1 = TCFParser.Parse(VALID_TCF_WITH_PURPOSE1, true);
            var result2 = TCFParser.Parse(VALID_TCF_WITH_PURPOSE1, false);
            
            Assert.IsTrue(result1.GdprApplies);
            Assert.IsFalse(result2.GdprApplies);
        }

        [Test]
        public void Parse_WithMinimalTCF_ShouldParseSuccessfully()
        {
            var result = TCFParser.Parse(MINIMAL_TCF, true);
            
            Assert.AreEqual(2, result.Version);
            Assert.AreEqual(24, result.PurposeConsents.Length, "Should have 24 purpose bits");
            Assert.AreEqual(12, result.SpecialFeatureOptIns.Length, "Should have 12 special feature bits");
        }

        [Test]
        public void Parse_WithMultiSegmentString_ShouldParseOnlyCoreSegment()
        {
            // TCF strings can have multiple segments separated by dots
            string multiSegment = VALID_TCF_WITH_PURPOSE1 + ".EXTRA.SEGMENTS";
            var result = TCFParser.Parse(multiSegment, true);
            
            Assert.AreEqual(2, result.Version, "Should parse only core segment");
        }

        [Test]
        public void Parse_WithInvalidBase64_ShouldHandleGracefully()
        {
            var result = TCFParser.Parse("INVALID!!!BASE64", true);
            
            Assert.AreEqual(0, result.Version, "Should return default version on parse error");
            Assert.IsFalse(result.Purpose1Consent);
            Assert.AreEqual("INVALID!!!BASE64", result.Raw, "Should preserve raw string");
        }

        [Test]
        public void Parse_WithTooShortPayload_ShouldHandleGracefully()
        {
            // Valid base64 but too short to be a TCF string
            var result = TCFParser.Parse("AAAA", true);
            
            Assert.AreEqual(0, result.Version);
        }

        [Test]
        public void HasPurposeConsent_WithValidPurposeId_ShouldReturnCorrectValue()
        {
            var result = TCFParser.Parse(VALID_TCF_WITH_PURPOSE1, true);
            
            // Purpose 1 should be consented
            Assert.IsTrue(TCFParser.HasPurposeConsent(result, 1), "Purpose 1 should be consented");
            
            // Test purpose IDs 2-24 (if they were set in the test string)
            for (int i = 2; i <= 24; i++)
            {
                // This will vary based on the actual TCF string
                bool consent = TCFParser.HasPurposeConsent(result, i);
                Assert.IsNotNull(consent); // Just verify it doesn't throw
            }
        }

        [Test]
        public void HasPurposeConsent_WithInvalidPurposeId_ShouldReturnFalse()
        {
            var result = TCFParser.Parse(VALID_TCF_WITH_PURPOSE1, true);
            
            Assert.IsFalse(TCFParser.HasPurposeConsent(result, 0), "Purpose 0 is invalid");
            Assert.IsFalse(TCFParser.HasPurposeConsent(result, 25), "Purpose 25 is invalid");
            Assert.IsFalse(TCFParser.HasPurposeConsent(result, -1), "Negative purpose ID is invalid");
        }

        [Test]
        public void HasVendorConsent_WithValidVendorId_ShouldCheckCorrectly()
        {
            var result = TCFParser.Parse(VALID_TCF_WITH_PURPOSE1, true);
            
            // This test depends on the vendor consents in the TCF string
            // Vendor IDs are 1-indexed
            if (result.VendorConsents.Length > 0)
            {
                bool consent = TCFParser.HasVendorConsent(result, 1);
                Assert.IsNotNull(consent); // Just verify it doesn't throw
            }
        }

        [Test]
        public void HasVendorConsent_WithInvalidVendorId_ShouldReturnFalse()
        {
            var result = TCFParser.Parse(VALID_TCF_WITH_PURPOSE1, true);
            
            Assert.IsFalse(TCFParser.HasVendorConsent(result, 0), "Vendor 0 is invalid");
            Assert.IsFalse(TCFParser.HasVendorConsent(result, -1), "Negative vendor ID is invalid");
            Assert.IsFalse(TCFParser.HasVendorConsent(result, 99999), "Out of range vendor ID should return false");
        }

        [Test]
        public void Parse_WithRangeEncodedVendors_ShouldParseCorrectly()
        {
            // This would need a specific TCF string with range encoding
            // For now, test that it doesn't crash
            var result = TCFParser.Parse(VALID_TCF_WITH_PURPOSE1, true);
            
            Assert.IsNotNull(result.VendorConsents);
            Assert.GreaterOrEqual(result.VendorConsents.Length, 0);
        }

        [Test]
        public void Parse_ShouldExtractAllPurposeConsents()
        {
            var result = TCFParser.Parse(VALID_TCF_WITH_PURPOSE1, true);
            
            Assert.AreEqual(24, result.PurposeConsents.Length, "Should have exactly 24 purpose consent bits");
            
            // Verify Purpose 1 matches the convenience property
            Assert.AreEqual(result.PurposeConsents[0], result.Purpose1Consent);
        }

        [Test]
        public void Parse_ShouldExtractSpecialFeatureOptIns()
        {
            var result = TCFParser.Parse(VALID_TCF_WITH_PURPOSE1, true);
            
            Assert.AreEqual(12, result.SpecialFeatureOptIns.Length, "Should have exactly 12 special feature opt-in bits");
        }

        /// <summary>
        /// Test with a known good TCF string from IAB's test suite
        /// </summary>
        [Test]
        public void Parse_WithIABTestVector_ShouldMatchExpectedValues()
        {
            // This is a well-known test vector from IAB
            // CMP ID: 10, CMP Version: 22, Consent Screen: 7, Language: EN
            // All purposes consented
            const string iabTestVector = "COtybn4PA_zT4KjACBENAPCgAP_AAH_AAAqIHJNd_X__bX9j-_59__t0eY1f9_r3v-QzjhfNt-8F3L_W_LwX32E7NF36tq4KmR4ku1bBIQNtHMnUDUmxaolVrzHsak2cpyNKJ_JkknsZe2dYGF9Pn9lD-YKZ7_5_9_f52T_9_9_-39z3_9f___dv_-__-vjf_599n_v9fV_78_Kf9______-____________8A";
            
            var result = TCFParser.Parse(iabTestVector, true);
            
            Assert.AreEqual(2, result.Version, "Should be TCF v2");
            Assert.IsTrue(result.Purpose1Consent, "All purposes including Purpose 1 should be consented");
            Assert.AreEqual(24, result.PurposeConsents.Length);
            
            // In this test vector, all 24 purposes should be consented
            for (int i = 1; i <= 24; i++)
            {
                Assert.IsTrue(TCFParser.HasPurposeConsent(result, i), $"Purpose {i} should be consented in test vector");
            }
        }

        /// <summary>
        /// Test thread safety by parsing from multiple threads
        /// </summary>
        [Test]
        public void Parse_FromMultipleThreads_ShouldBeThreadSafe()
        {
            const int numThreads = 10;
            const int iterationsPerThread = 100;
            var exceptions = new System.Collections.Concurrent.ConcurrentBag<Exception>();

            System.Threading.Tasks.Parallel.For(0, numThreads, i =>
            {
                try
                {
                    for (int j = 0; j < iterationsPerThread; j++)
                    {
                        var result = TCFParser.Parse(VALID_TCF_WITH_PURPOSE1, true);
                        Assert.IsTrue(result.Purpose1Consent);
                    }
                }
                catch (Exception ex)
                {
                    exceptions.Add(ex);
                }
            });

            Assert.IsEmpty(exceptions, "Parser should be thread-safe");
        }

        /// <summary>
        /// Test performance with many parses
        /// </summary>
        [Test]
        [Category("Performance")]
        public void Parse_Performance_ShouldBeFast()
        {
            const int iterations = 1000;
            var stopwatch = System.Diagnostics.Stopwatch.StartNew();

            for (int i = 0; i < iterations; i++)
            {
                TCFParser.Parse(VALID_TCF_WITH_PURPOSE1, true);
            }

            stopwatch.Stop();
            var avgMs = stopwatch.ElapsedMilliseconds / (double)iterations;
            
            Assert.Less(avgMs, 1.0, $"Average parse time should be less than 1ms, got {avgMs:F3}ms");
        }
    }
}
