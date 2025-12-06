using UnityEditor;
using UnityEngine;

namespace RivalApex.Mediation.Editor
{
    /// <summary>
    /// Custom Inspector for SDKConfig with validation and helper UI
    /// </summary>
    [CustomEditor(typeof(SDKConfig))]
    public class SDKConfigInspector : UnityEditor.Editor
    {
        private SerializedProperty _appIdProp;
        private SerializedProperty _apiKeyProp;
        private SerializedProperty _testModeProp;
        private SerializedProperty _debugLoggingProp;
        private SerializedProperty _auctionEndpointProp;
        private SerializedProperty _configEndpointProp;
        private SerializedProperty _requestTimeoutProp;
        private SerializedProperty _maxRetriesProp;
        private SerializedProperty _defaultAdTTLProp;
        private SerializedProperty _bannerRefreshIntervalProp;
        private SerializedProperty _appOpenRateLimitProp;
        private SerializedProperty _coppaEnabledProp;
        private SerializedProperty _defaultGDPRConsentProp;
        
        private bool _showAdvanced = false;
        
        private void OnEnable()
        {
            _appIdProp = serializedObject.FindProperty("AppId");
            _apiKeyProp = serializedObject.FindProperty("ApiKey");
            _testModeProp = serializedObject.FindProperty("TestMode");
            _debugLoggingProp = serializedObject.FindProperty("DebugLogging");
            _auctionEndpointProp = serializedObject.FindProperty("AuctionEndpoint");
            _configEndpointProp = serializedObject.FindProperty("ConfigEndpoint");
            _requestTimeoutProp = serializedObject.FindProperty("RequestTimeout");
            _maxRetriesProp = serializedObject.FindProperty("MaxRetries");
            _defaultAdTTLProp = serializedObject.FindProperty("DefaultAdTTL");
            _bannerRefreshIntervalProp = serializedObject.FindProperty("BannerRefreshInterval");
            _appOpenRateLimitProp = serializedObject.FindProperty("AppOpenRateLimit");
            _coppaEnabledProp = serializedObject.FindProperty("COPPAEnabled");
            _defaultGDPRConsentProp = serializedObject.FindProperty("DefaultGDPRConsent");
        }
        
        public override void OnInspectorGUI()
        {
            serializedObject.Update();
            
            EditorGUILayout.LabelField("Apex Mediation SDK Configuration", EditorStyles.boldLabel);
            EditorGUILayout.Space();
            
            // Authentication
            EditorGUILayout.LabelField("Authentication", EditorStyles.boldLabel);
            EditorGUILayout.PropertyField(_appIdProp, new GUIContent("App ID", "Your application ID from Apex dashboard"));
            EditorGUILayout.PropertyField(_apiKeyProp, new GUIContent("API Key", "Your API key from Apex dashboard"));
            
            if (string.IsNullOrEmpty(_appIdProp.stringValue) || string.IsNullOrEmpty(_apiKeyProp.stringValue))
            {
                EditorGUILayout.HelpBox("App ID and API Key are required. Get them from the Apex Mediation dashboard.", MessageType.Error);
            }
            
            EditorGUILayout.Space();
            
            // Environment
            EditorGUILayout.LabelField("Environment", EditorStyles.boldLabel);
            EditorGUILayout.PropertyField(_testModeProp, new GUIContent("Test Mode", "Enable for testing with test ads"));
            EditorGUILayout.PropertyField(_debugLoggingProp, new GUIContent("Debug Logging", "Enable verbose logging"));
            
            if (_testModeProp.boolValue)
            {
                EditorGUILayout.HelpBox("Test Mode is enabled. Remember to disable for production builds!", MessageType.Warning);
            }
            
            EditorGUILayout.Space();
            
            // Privacy
            EditorGUILayout.LabelField("Privacy", EditorStyles.boldLabel);
            EditorGUILayout.PropertyField(_coppaEnabledProp, new GUIContent("COPPA Enabled", "Enable COPPA compliance for children under 13"));
            EditorGUILayout.PropertyField(_defaultGDPRConsentProp, new GUIContent("Default GDPR Consent", "Default consent if user hasn't set it"));
            
            EditorGUILayout.Space();
            
            // Advanced Settings (Foldout)
            _showAdvanced = EditorGUILayout.Foldout(_showAdvanced, "Advanced Settings", true);
            if (_showAdvanced)
            {
                EditorGUI.indentLevel++;
                
                EditorGUILayout.LabelField("Network", EditorStyles.boldLabel);
                EditorGUILayout.PropertyField(_auctionEndpointProp, new GUIContent("Auction Endpoint"));
                EditorGUILayout.PropertyField(_configEndpointProp, new GUIContent("Config Endpoint"));
                EditorGUILayout.PropertyField(_requestTimeoutProp, new GUIContent("Request Timeout (seconds)"));
                EditorGUILayout.PropertyField(_maxRetriesProp, new GUIContent("Max Retries"));
                
                EditorGUILayout.Space();
                
                EditorGUILayout.LabelField("Ad Behavior", EditorStyles.boldLabel);
                EditorGUILayout.PropertyField(_defaultAdTTLProp, new GUIContent("Default Ad TTL (seconds)"));
                EditorGUILayout.PropertyField(_bannerRefreshIntervalProp, new GUIContent("Banner Refresh Interval (seconds)"));
                EditorGUILayout.PropertyField(_appOpenRateLimitProp, new GUIContent("App Open Rate Limit (seconds)"));
                
                EditorGUI.indentLevel--;
            }
            
            EditorGUILayout.Space();
            
            // Validation Button
            if (GUILayout.Button("Validate Configuration", GUILayout.Height(30)))
            {
                ValidateConfiguration();
            }
            
            // Quick Actions
            EditorGUILayout.Space();
            EditorGUILayout.LabelField("Quick Actions", EditorStyles.boldLabel);
            
            EditorGUILayout.BeginHorizontal();
            if (GUILayout.Button("Open Integration Validator"))
            {
                IntegrationValidator.ShowWindow();
            }
            if (GUILayout.Button("View Documentation"))
            {
                Application.OpenURL("https://apexmediation.ee/docs");
            }
            EditorGUILayout.EndHorizontal();
            
            serializedObject.ApplyModifiedProperties();
        }
        
        private void ValidateConfiguration()
        {
            var config = (SDKConfig)target;
            
            int issues = 0;
            
            if (string.IsNullOrEmpty(config.AppId))
            {
                Debug.LogError("[ApexMediation] App ID is required");
                issues++;
            }
            
            if (string.IsNullOrEmpty(config.ApiKey))
            {
                Debug.LogError("[ApexMediation] API Key is required");
                issues++;
            }
            
            if (config.RequestTimeout < 3 || config.RequestTimeout > 30)
            {
                Debug.LogWarning("[ApexMediation] Request timeout should be between 3-30 seconds");
                issues++;
            }
            
            if (issues == 0)
            {
                Debug.Log("[ApexMediation] Configuration is valid ✓");
                EditorUtility.DisplayDialog("Validation Success", "SDK configuration is valid!", "OK");
            }
            else
            {
                EditorUtility.DisplayDialog("Validation Failed", $"Found {issues} configuration issue(s). Check the Console for details.", "OK");
            }
        }
    }
}
