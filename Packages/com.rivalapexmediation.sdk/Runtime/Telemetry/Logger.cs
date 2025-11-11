using UnityEngine;

namespace RivalApex.Mediation
{
    /// <summary>
    /// Centralized logging utility with PII redaction
    /// </summary>
    public static class Logger
    {
        private static bool _debugLoggingEnabled = false;
        
        public static bool IsDebugEnabled => _debugLoggingEnabled;
        
        public static void SetDebugLogging(bool enabled)
        {
            _debugLoggingEnabled = enabled;
            if (enabled)
            {
                Debug.Log("[ApexMediation] Debug logging enabled");
            }
        }
        
        public static void Log(string message)
        {
            if (_debugLoggingEnabled)
            {
                Debug.Log($"[ApexMediation] {message}");
            }
        }
        
        public static void LogWarning(string message)
        {
            Debug.LogWarning($"[ApexMediation] {message}");
        }
        
        public static void LogError(string message)
        {
            Debug.LogError($"[ApexMediation] {message}");
        }
        
        public static void LogException(System.Exception exception)
        {
            Debug.LogError($"[ApexMediation] Exception: {exception.Message}");
            if (_debugLoggingEnabled)
            {
                Debug.LogException(exception);
            }
        }
        
        /// <summary>
        /// Redact PII from strings for safe logging
        /// </summary>
        public static string RedactPII(string input)
        {
            if (string.IsNullOrEmpty(input))
            {
                return input;
            }
            
            // Redact email-like patterns
            input = System.Text.RegularExpressions.Regex.Replace(input, @"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b", "[EMAIL_REDACTED]");
            
            // Redact phone number patterns
            input = System.Text.RegularExpressions.Regex.Replace(input, @"\b\d{3}[-.]?\d{3}[-.]?\d{4}\b", "[PHONE_REDACTED]");
            
            // Redact long numeric IDs (likely device IDs)
            input = System.Text.RegularExpressions.Regex.Replace(input, @"\b[0-9A-Fa-f]{32,}\b", "[ID_REDACTED]");
            
            return input;
        }
    }
}
