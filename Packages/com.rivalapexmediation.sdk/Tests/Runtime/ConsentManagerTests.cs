using NUnit.Framework;
using RivalApex.Mediation;
using UnityEngine;

namespace RivalApex.Mediation.Tests
{
    /// <summary>
    /// Edit Mode tests for ConsentManager
    /// </summary>
    [TestFixture]
    public class ConsentManagerTests
    {
        private ConsentManager _consentManager;
        
        [SetUp]
        public void SetUp()
        {
            _consentManager = new ConsentManager();
            _consentManager.ClearConsent();
        }
        
        [TearDown]
        public void TearDown()
        {
            _consentManager?.ClearConsent();
        }
        
        [Test]
        public void DefaultConsent_HasNoRestrictions()
        {
            var consent = _consentManager.GetConsent();
            
            Assert.IsFalse(consent.gdpr_applies);
            Assert.IsNull(consent.gdpr_consent_string);
            Assert.IsFalse(consent.ccpa_opt_out);
            Assert.IsFalse(consent.coppa);
        }
        
        [Test]
        public void SetConsent_PersistsData()
        {
            var testConsent = new ConsentData
            {
                gdpr_applies = true,
                gdpr_consent_string = "test-consent-123",
                ccpa_opt_out = false,
                coppa = false
            };
            
            _consentManager.SetConsent(testConsent);
            
            var retrieved = _consentManager.GetConsent();
            Assert.IsTrue(retrieved.gdpr_applies);
            Assert.AreEqual("test-consent-123", retrieved.gdpr_consent_string);
            Assert.IsFalse(retrieved.ccpa_opt_out);
            Assert.IsFalse(retrieved.coppa);
        }
        
        [Test]
        public void SetConsent_WithNull_LogsWarning()
        {
            // Should not crash, just log warning
            _consentManager.SetConsent(null);
            
            // Should still return default consent
            var consent = _consentManager.GetConsent();
            Assert.IsNotNull(consent);
        }
        
        [Test]
        public void CanShowPersonalizedAds_COPPA_ReturnsFalse()
        {
            var testConsent = new ConsentData
            {
                coppa = true
            };
            
            _consentManager.SetConsent(testConsent);
            
            Assert.IsFalse(_consentManager.CanShowPersonalizedAds());
        }
        
        [Test]
        public void CanShowPersonalizedAds_CCPAOptOut_ReturnsFalse()
        {
            var testConsent = new ConsentData
            {
                ccpa_opt_out = true
            };
            
            _consentManager.SetConsent(testConsent);
            
            Assert.IsFalse(_consentManager.CanShowPersonalizedAds());
        }
        
        [Test]
        public void CanShowPersonalizedAds_GDPRWithoutConsent_ReturnsFalse()
        {
            var testConsent = new ConsentData
            {
                gdpr_applies = true,
                gdpr_consent_string = null
            };
            
            _consentManager.SetConsent(testConsent);
            
            Assert.IsFalse(_consentManager.CanShowPersonalizedAds());
        }
        
        [Test]
        public void CanShowPersonalizedAds_GDPRWithConsent_ReturnsTrue()
        {
            var testConsent = new ConsentData
            {
                gdpr_applies = true,
                gdpr_consent_string = "valid-consent"
            };
            
            _consentManager.SetConsent(testConsent);
            
            Assert.IsTrue(_consentManager.CanShowPersonalizedAds());
        }
        
        [Test]
        public void CanShowPersonalizedAds_NoRestrictions_ReturnsTrue()
        {
            var testConsent = new ConsentData
            {
                gdpr_applies = false,
                ccpa_opt_out = false,
                coppa = false
            };
            
            _consentManager.SetConsent(testConsent);
            
            Assert.IsTrue(_consentManager.CanShowPersonalizedAds());
        }
        
        [Test]
        public void GetRedactedConsentInfo_DoesNotExposeConsentString()
        {
            var testConsent = new ConsentData
            {
                gdpr_applies = true,
                gdpr_consent_string = "secret-consent-string-123",
                ccpa_opt_out = true,
                coppa = false
            };
            
            _consentManager.SetConsent(testConsent);
            
            var redacted = _consentManager.GetRedactedConsentInfo();
            
            // Should not contain actual consent string
            Assert.IsFalse(redacted.Contains("secret-consent-string-123"));
            
            // Should contain redacted info
            StringAssert.Contains("GDPR:True", redacted);
            StringAssert.Contains("consent:True", redacted); // has consent (redacted)
            StringAssert.Contains("CCPA OptOut:True", redacted);
            StringAssert.Contains("COPPA:False", redacted);
        }
        
        [Test]
        public void ClearConsent_ResetsToDefault()
        {
            var testConsent = new ConsentData
            {
                gdpr_applies = true,
                gdpr_consent_string = "test",
                ccpa_opt_out = true,
                coppa = true
            };
            
            _consentManager.SetConsent(testConsent);
            _consentManager.ClearConsent();
            
            var consent = _consentManager.GetConsent();
            Assert.IsFalse(consent.gdpr_applies);
            Assert.IsNull(consent.gdpr_consent_string);
            Assert.IsFalse(consent.ccpa_opt_out);
            Assert.IsFalse(consent.coppa);
        }
        
        [Test]
        public void IsGDPRApplicable_ReturnsCorrectValue()
        {
            Assert.IsFalse(_consentManager.IsGDPRApplicable());
            
            _consentManager.SetConsent(new ConsentData { gdpr_applies = true });
            Assert.IsTrue(_consentManager.IsGDPRApplicable());
        }
        
        [Test]
        public void IsCCPAOptOut_ReturnsCorrectValue()
        {
            Assert.IsFalse(_consentManager.IsCCPAOptOut());
            
            _consentManager.SetConsent(new ConsentData { ccpa_opt_out = true });
            Assert.IsTrue(_consentManager.IsCCPAOptOut());
        }
        
        [Test]
        public void IsCOPPAEnabled_ReturnsCorrectValue()
        {
            Assert.IsFalse(_consentManager.IsCOPPAEnabled());
            
            _consentManager.SetConsent(new ConsentData { coppa = true });
            Assert.IsTrue(_consentManager.IsCOPPAEnabled());
        }
    }
}
