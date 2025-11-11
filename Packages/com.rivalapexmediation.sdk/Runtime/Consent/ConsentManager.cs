using UnityEngine;

namespace RivalApex.Mediation
{
    /// <summary>
    /// Consent data for GDPR, CCPA, and COPPA compliance
    /// </summary>
    [System.Serializable]
    public class ConsentData
    {
        public bool gdpr_applies;
        public string gdpr_consent_string;
        public bool ccpa_opt_out;
        public bool coppa;
        
        public ConsentData()
        {
            gdpr_applies = false;
            gdpr_consent_string = null;
            ccpa_opt_out = false;
            coppa = false;
        }
    }
    
    /// <summary>
    /// Manages user consent for GDPR, CCPA, and COPPA compliance
    /// </summary>
    public class ConsentManager
    {
        private const string PREFS_KEY_GDPR_APPLIES = "ApexMediation_GDPR_Applies";
        private const string PREFS_KEY_GDPR_CONSENT_STRING = "ApexMediation_GDPR_ConsentString";
        private const string PREFS_KEY_CCPA_OPT_OUT = "ApexMediation_CCPA_OptOut";
        private const string PREFS_KEY_COPPA = "ApexMediation_COPPA";
        
        private ConsentData _currentConsent;
        
        public ConsentManager()
        {
            LoadConsent();
        }
        
        /// <summary>
        /// Set user consent data and persist to PlayerPrefs
        /// </summary>
        public void SetConsent(ConsentData consent)
        {
            if (consent == null)
            {
                Debug.LogWarning("[ApexMediation] ConsentManager: Attempted to set null consent");
                return;
            }
            
            _currentConsent = consent;
            SaveConsent();
            
            if (Logger.IsDebugEnabled)
            {
                Debug.Log($"[ApexMediation] Consent updated: GDPR={consent.gdpr_applies}, CCPA OptOut={consent.ccpa_opt_out}, COPPA={consent.coppa}");
            }
        }
        
        /// <summary>
        /// Get current consent data
        /// </summary>
        public ConsentData GetConsent()
        {
            return _currentConsent ?? new ConsentData();
        }
        
        /// <summary>
        /// Check if personalized ads can be shown based on consent
        /// </summary>
        public bool CanShowPersonalizedAds()
        {
            var consent = GetConsent();
            
            // COPPA always blocks personalized ads
            if (consent.coppa)
            {
                return false;
            }
            
            // CCPA opt-out blocks personalized ads
            if (consent.ccpa_opt_out)
            {
                return false;
            }
            
            // GDPR requires explicit consent
            if (consent.gdpr_applies && string.IsNullOrEmpty(consent.gdpr_consent_string))
            {
                return false;
            }
            
            return true;
        }
        
        /// <summary>
        /// Get redacted consent info safe for logging (no PII)
        /// </summary>
        public string GetRedactedConsentInfo()
        {
            var consent = GetConsent();
            var hasConsentString = !string.IsNullOrEmpty(consent.gdpr_consent_string);
            return $"GDPR:{consent.gdpr_applies} (consent:{hasConsentString}), CCPA OptOut:{consent.ccpa_opt_out}, COPPA:{consent.coppa}";
        }
        
        /// <summary>
        /// Check if GDPR applies (European region)
        /// </summary>
        public bool IsGDPRApplicable()
        {
            return _currentConsent?.gdpr_applies ?? false;
        }
        
        /// <summary>
        /// Check if CCPA opt-out is set (California users)
        /// </summary>
        public bool IsCCPAOptOut()
        {
            return _currentConsent?.ccpa_opt_out ?? false;
        }
        
        /// <summary>
        /// Check if COPPA mode is enabled (children under 13)
        /// </summary>
        public bool IsCOPPAEnabled()
        {
            return _currentConsent?.coppa ?? false;
        }
        
        /// <summary>
        /// Clear all consent data
        /// </summary>
        public void ClearConsent()
        {
            _currentConsent = new ConsentData();
            PlayerPrefs.DeleteKey(PREFS_KEY_GDPR_APPLIES);
            PlayerPrefs.DeleteKey(PREFS_KEY_GDPR_CONSENT_STRING);
            PlayerPrefs.DeleteKey(PREFS_KEY_CCPA_OPT_OUT);
            PlayerPrefs.DeleteKey(PREFS_KEY_COPPA);
            PlayerPrefs.Save();
            
            Debug.Log("[ApexMediation] Consent data cleared");
        }
        
        private void LoadConsent()
        {
            _currentConsent = new ConsentData
            {
                gdpr_applies = PlayerPrefs.GetInt(PREFS_KEY_GDPR_APPLIES, 0) == 1,
                gdpr_consent_string = PlayerPrefs.GetString(PREFS_KEY_GDPR_CONSENT_STRING, null),
                ccpa_opt_out = PlayerPrefs.GetInt(PREFS_KEY_CCPA_OPT_OUT, 0) == 1,
                coppa = PlayerPrefs.GetInt(PREFS_KEY_COPPA, 0) == 1
            };
            
            if (Logger.IsDebugEnabled)
            {
                Debug.Log($"[ApexMediation] Consent loaded: {GetRedactedConsentInfo()}");
            }
        }
        
        private void SaveConsent()
        {
            if (_currentConsent == null) return;
            
            PlayerPrefs.SetInt(PREFS_KEY_GDPR_APPLIES, _currentConsent.gdpr_applies ? 1 : 0);
            PlayerPrefs.SetString(PREFS_KEY_GDPR_CONSENT_STRING, _currentConsent.gdpr_consent_string ?? "");
            PlayerPrefs.SetInt(PREFS_KEY_CCPA_OPT_OUT, _currentConsent.ccpa_opt_out ? 1 : 0);
            PlayerPrefs.SetInt(PREFS_KEY_COPPA, _currentConsent.coppa ? 1 : 0);
            PlayerPrefs.Save();
        }
    }
}
