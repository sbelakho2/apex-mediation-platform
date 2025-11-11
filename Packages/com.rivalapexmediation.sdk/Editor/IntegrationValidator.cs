using UnityEditor;
using UnityEngine;
using System.IO;
using System.Linq;

namespace RivalApex.Mediation.Editor
{
    /// <summary>
    /// Pre-build integration validator for SDK configuration
    /// </summary>
    public class IntegrationValidator : EditorWindow
    {
        private Vector2 _scrollPosition;
        private ValidationResult _lastResult;
        
        [MenuItem("Apex Mediation/Integration Validator")]
        public static void ShowWindow()
        {
            var window = GetWindow<IntegrationValidator>("Apex Integration Validator");
            window.minSize = new Vector2(400, 300);
        }
        
        private void OnEnable()
        {
            RunValidation();
        }
        
        private void OnGUI()
        {
            EditorGUILayout.LabelField("Integration Validator", EditorStyles.boldLabel);
            EditorGUILayout.Space();
            
            if (GUILayout.Button("Run Validation", GUILayout.Height(30)))
            {
                RunValidation();
            }
            
            EditorGUILayout.Space();
            
            if (_lastResult == null)
            {
                EditorGUILayout.HelpBox("Click 'Run Validation' to check your integration", MessageType.Info);
                return;
            }
            
            _scrollPosition = EditorGUILayout.BeginScrollView(_scrollPosition);
            
            // Summary
            var summaryType = _lastResult.ErrorCount > 0 ? MessageType.Error :
                             _lastResult.WarningCount > 0 ? MessageType.Warning :
                             MessageType.Info;
            
            EditorGUILayout.HelpBox(
                $"Validation Complete: {_lastResult.PassedCount} passed, {_lastResult.WarningCount} warnings, {_lastResult.ErrorCount} errors",
                summaryType
            );
            
            EditorGUILayout.Space();
            
            // Results
            foreach (var check in _lastResult.Checks)
            {
                DrawCheckResult(check);
            }
            
            EditorGUILayout.EndScrollView();
        }
        
        private void DrawCheckResult(ValidationCheck check)
        {
            var color = check.Status == CheckStatus.Pass ? Color.green :
                       check.Status == CheckStatus.Warning ? Color.yellow :
                       Color.red;
            
            var icon = check.Status == CheckStatus.Pass ? "✓" :
                      check.Status == CheckStatus.Warning ? "⚠" :
                      "✗";
            
            var prevColor = GUI.color;
            GUI.color = color;
            EditorGUILayout.BeginHorizontal(EditorStyles.helpBox);
            GUI.color = prevColor;
            
            EditorGUILayout.LabelField(icon, GUILayout.Width(20));
            EditorGUILayout.LabelField(check.Name, EditorStyles.boldLabel);
            EditorGUILayout.EndHorizontal();
            
            if (!string.IsNullOrEmpty(check.Message))
            {
                EditorGUILayout.LabelField(check.Message, EditorStyles.wordWrappedLabel);
            }
            
            if (!string.IsNullOrEmpty(check.FixAction))
            {
                EditorGUILayout.LabelField($"Fix: {check.FixAction}", EditorStyles.miniLabel);
            }
            
            EditorGUILayout.Space(5);
        }
        
        private void RunValidation()
        {
            _lastResult = new ValidationResult();
            
            // Check 1: SDK Config exists
            CheckSDKConfig();
            
            // Check 2: Assembly definitions
            CheckAssemblyDefinitions();
            
            // Check 3: iOS configuration
            CheckIOSConfiguration();
            
            // Check 4: Android configuration
            CheckAndroidConfiguration();
            
            // Check 5: Script compilation
            CheckScriptCompilation();
            
            // Check 6: Package integrity
            CheckPackageIntegrity();
        }
        
        private void CheckSDKConfig()
        {
            var configs = Resources.FindObjectsOfTypeAll<SDKConfig>();
            
            if (configs.Length == 0)
            {
                _lastResult.AddError("SDK Config",
                    "No SDKConfig asset found in project",
                    "Create one via Assets → Create → Apex Mediation → SDK Config");
                return;
            }
            
            var config = configs[0];
            
            if (string.IsNullOrEmpty(config.AppId))
            {
                _lastResult.AddError("SDK Config - App ID",
                    "App ID is not set in SDKConfig",
                    "Set your App ID from the Apex Mediation dashboard");
                return;
            }
            
            if (string.IsNullOrEmpty(config.ApiKey))
            {
                _lastResult.AddError("SDK Config - API Key",
                    "API Key is not set in SDKConfig",
                    "Set your API Key from the Apex Mediation dashboard");
                return;
            }
            
            if (config.TestMode)
            {
                _lastResult.AddWarning("SDK Config - Test Mode",
                    "Test Mode is enabled. Remember to disable for production builds",
                    "Disable TestMode in SDKConfig before shipping");
            }
            else
            {
                _lastResult.AddPass("SDK Config", "SDKConfig is properly configured");
            }
        }
        
        private void CheckAssemblyDefinitions()
        {
            var runtimeAsmdef = AssetDatabase.FindAssets("ApexMediation t:asmdef").Length > 0;
            var editorAsmdef = AssetDatabase.FindAssets("ApexMediationEditor t:asmdef").Length > 0;
            var testsAsmdef = AssetDatabase.FindAssets("ApexMediationTests t:asmdef").Length > 0;
            
            if (runtimeAsmdef && editorAsmdef && testsAsmdef)
            {
                _lastResult.AddPass("Assembly Definitions", "All assembly definitions are present");
            }
            else
            {
                _lastResult.AddWarning("Assembly Definitions",
                    "Some assembly definitions may be missing",
                    "Ensure package is properly imported");
            }
        }
        
        private void CheckIOSConfiguration()
        {
#if UNITY_IOS
            // Check for Info.plist entries
            var plistPath = "Assets/Plugins/iOS/ApexMediation-Info.plist";
            if (!File.Exists(plistPath))
            {
                _lastResult.AddWarning("iOS - Info.plist",
                    "Custom Info.plist not found. ATT permission may be missing",
                    "Add NSUserTrackingUsageDescription to Info.plist for IDFA support");
            }
            else
            {
                _lastResult.AddPass("iOS - Info.plist", "Info.plist configured");
            }
#endif
        }
        
        private void CheckAndroidConfiguration()
        {
#if UNITY_ANDROID
            // Check for AndroidManifest entries
            var manifestPath = "Assets/Plugins/Android/AndroidManifest.xml";
            if (File.Exists(manifestPath))
            {
                var manifestContent = File.ReadAllText(manifestPath);
                if (!manifestContent.Contains("com.google.android.gms.permission.AD_ID"))
                {
                    _lastResult.AddWarning("Android - Permissions",
                        "AD_ID permission may be missing in AndroidManifest.xml",
                        "Add AD_ID permission for GAID support on Android 13+");
                }
                else
                {
                    _lastResult.AddPass("Android - Permissions", "AndroidManifest configured");
                }
            }
#endif
        }
        
        private void CheckScriptCompilation()
        {
            if (!EditorApplication.isCompiling)
            {
                _lastResult.AddPass("Script Compilation", "No compilation errors detected");
            }
            else
            {
                _lastResult.AddWarning("Script Compilation",
                    "Scripts are currently compiling",
                    "Wait for compilation to finish");
            }
        }
        
        private void CheckPackageIntegrity()
        {
            var packagePath = "Packages/com.rivalapexmediation.sdk";
            if (Directory.Exists(packagePath))
            {
                var requiredFolders = new[] { "Runtime", "Editor", "Tests" };
                var missingFolders = requiredFolders.Where(f => !Directory.Exists(Path.Combine(packagePath, f))).ToList();
                
                if (missingFolders.Any())
                {
                    _lastResult.AddError("Package Integrity",
                        $"Missing folders: {string.Join(", ", missingFolders)}",
                        "Reinstall the package");
                }
                else
                {
                    _lastResult.AddPass("Package Integrity", "Package structure is intact");
                }
            }
            else
            {
                _lastResult.AddError("Package Integrity",
                    "Package not found at expected location",
                    "Ensure package is properly installed via Package Manager");
            }
        }
        
        private class ValidationResult
        {
            public System.Collections.Generic.List<ValidationCheck> Checks = new System.Collections.Generic.List<ValidationCheck>();
            public int PassedCount => Checks.Count(c => c.Status == CheckStatus.Pass);
            public int WarningCount => Checks.Count(c => c.Status == CheckStatus.Warning);
            public int ErrorCount => Checks.Count(c => c.Status == CheckStatus.Error);
            
            public void AddPass(string name, string message)
            {
                Checks.Add(new ValidationCheck { Name = name, Message = message, Status = CheckStatus.Pass });
            }
            
            public void AddWarning(string name, string message, string fix)
            {
                Checks.Add(new ValidationCheck { Name = name, Message = message, FixAction = fix, Status = CheckStatus.Warning });
            }
            
            public void AddError(string name, string message, string fix)
            {
                Checks.Add(new ValidationCheck { Name = name, Message = message, FixAction = fix, Status = CheckStatus.Error });
            }
        }
        
        private class ValidationCheck
        {
            public string Name;
            public string Message;
            public string FixAction;
            public CheckStatus Status;
        }
        
        private enum CheckStatus
        {
            Pass,
            Warning,
            Error
        }
    }
}
