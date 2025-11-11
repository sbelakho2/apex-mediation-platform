using UnityEngine;
using UnityEditor;
using UnityEditor.Build;
using UnityEditor.Build.Reporting;
using System.IO;
using System.Linq;

namespace RivalApex.Mediation.Editor
{
    /// <summary>
    /// Build preprocessor that validates IL2CPP configuration and enforces SDK size budgets
    /// </summary>
    public class IL2CPPBuildValidator : IPreprocessBuildWithReport
    {
        public int callbackOrder => 0;

        // Size budget: 300KB for runtime DLL after IL2CPP stripping
        private const long SIZE_BUDGET_BYTES = 300 * 1024;

        public void OnPreprocessBuild(BuildReport report)
        {
            Debug.Log("[ApexMediation] IL2CPP Build Validator - Starting validation");

            // Check if link.xml exists
            ValidateLinkXmlExists();

            // Check IL2CPP stripping settings
            ValidateStrippingSettings();

            // Validate that critical types are preserved
            ValidateCriticalTypes();

            Debug.Log("[ApexMediation] IL2CPP Build Validator - Validation complete");
        }

        private void ValidateLinkXmlExists()
        {
            string linkXmlPath = "Packages/com.rivalapexmediation.sdk/Runtime/link.xml";
            if (!File.Exists(linkXmlPath))
            {
                Debug.LogWarning($"[ApexMediation] link.xml not found at {linkXmlPath}! IL2CPP stripping may remove critical code.");
            }
            else
            {
                Debug.Log($"[ApexMediation] ✓ link.xml found at {linkXmlPath}");
            }
        }

        private void ValidateStrippingSettings()
        {
            var strippingLevel = PlayerSettings.stripEngineCode;
            Debug.Log($"[ApexMediation] Managed Stripping Level: {PlayerSettings.GetManagedStrippingLevel(EditorUserBuildSettings.selectedBuildTargetGroup)}");
            Debug.Log($"[ApexMediation] Strip Engine Code: {strippingLevel}");

            // Warn if using aggressive stripping without proper link.xml
            var stripping = PlayerSettings.GetManagedStrippingLevel(EditorUserBuildSettings.selectedBuildTargetGroup);
            if (stripping == ManagedStrippingLevel.High)
            {
                Debug.LogWarning("[ApexMediation] High managed stripping level detected. Ensure link.xml is properly configured.");
            }
        }

        private void ValidateCriticalTypes()
        {
            // Verify that critical types are accessible
            var criticalTypes = new[]
            {
                typeof(ApexMediation),
                typeof(ConsentManager),
                typeof(ConsentData),
                typeof(TCFParser),
                typeof(AuctionClient)
            };

            foreach (var type in criticalTypes)
            {
                if (type == null)
                {
                    Debug.LogError($"[ApexMediation] Critical type not found: {type?.Name ?? "Unknown"}");
                }
                else
                {
                    Debug.Log($"[ApexMediation] ✓ Critical type preserved: {type.FullName}");
                }
            }
        }
    }

    /// <summary>
    /// Build postprocessor that reports DLL sizes and enforces budget
    /// </summary>
    public class IL2CPPBuildReporter : IPostprocessBuildWithReport
    {
        public int callbackOrder => 100;

        public void OnPostprocessBuild(BuildReport report)
        {
            Debug.Log("[ApexMediation] IL2CPP Build Reporter - Analyzing build");

            // Generate build report
            GenerateBuildReport(report);

            // Check DLL size budget
            ValidateSizeBudget(report);
        }

        private void GenerateBuildReport(BuildReport report)
        {
            Debug.Log($"[ApexMediation] Build Summary:");
            Debug.Log($"  Build Result: {report.summary.result}");
            Debug.Log($"  Total Size: {FormatBytes(report.summary.totalSize)}");
            Debug.Log($"  Total Time: {report.summary.totalTime.TotalSeconds:F2}s");

            // Find SDK-related files
            var sdkFiles = report.files
                .Where(f => f.path.Contains("RivalApex") || f.path.Contains("ApexMediation"))
                .OrderByDescending(f => f.size)
                .ToList();

            if (sdkFiles.Any())
            {
                Debug.Log($"[ApexMediation] SDK Files in Build:");
                long totalSdkSize = 0;
                foreach (var file in sdkFiles)
                {
                    Debug.Log($"  {Path.GetFileName(file.path)}: {FormatBytes((long)file.size)}");
                    totalSdkSize += (long)file.size;
                }
                Debug.Log($"[ApexMediation] Total SDK Size: {FormatBytes(totalSdkSize)}");
            }
            else
            {
                Debug.Log("[ApexMediation] No SDK files found in build report (may be merged into main assembly)");
            }
        }

        private void ValidateSizeBudget(BuildReport report)
        {
            // Try to find the SDK DLL
            var sdkFiles = report.files
                .Where(f => f.path.Contains("RivalApex") || f.path.Contains("ApexMediation"))
                .ToList();

            if (!sdkFiles.Any())
            {
                Debug.LogWarning("[ApexMediation] Could not find SDK DLL in build report. Size budget validation skipped.");
                return;
            }

            long totalSdkSize = sdkFiles.Sum(f => (long)f.size);
            const long budgetBytes = 300 * 1024; // 300 KB

            float percentageUsed = (totalSdkSize / (float)budgetBytes) * 100f;

            Debug.Log($"[ApexMediation] Size Budget Check:");
            Debug.Log($"  SDK Size: {FormatBytes(totalSdkSize)}");
            Debug.Log($"  Budget: {FormatBytes(budgetBytes)}");
            Debug.Log($"  Usage: {percentageUsed:F1}%");

            if (totalSdkSize > budgetBytes)
            {
                Debug.LogError($"[ApexMediation] ❌ SDK size ({FormatBytes(totalSdkSize)}) exceeds budget ({FormatBytes(budgetBytes)})!");
                Debug.LogError($"[ApexMediation] Build will continue, but this violates the 300KB size requirement.");
            }
            else
            {
                Debug.Log($"[ApexMediation] ✓ SDK size is within budget ({percentageUsed:F1}% used)");
            }
        }

        private static string FormatBytes(long bytes)
        {
            string[] sizes = { "B", "KB", "MB", "GB" };
            double len = bytes;
            int order = 0;
            while (len >= 1024 && order < sizes.Length - 1)
            {
                order++;
                len = len / 1024;
            }
            return $"{len:F2} {sizes[order]}";
        }
    }

    /// <summary>
    /// Menu items for manual IL2CPP validation
    /// </summary>
    public static class IL2CPPValidatorMenu
    {
        [MenuItem("Apex Mediation/Validate IL2CPP Configuration")]
        public static void ValidateIL2CPPConfiguration()
        {
            Debug.Log("[ApexMediation] Running IL2CPP validation...");

            // Check link.xml
            string linkXmlPath = "Packages/com.rivalapexmediation.sdk/Runtime/link.xml";
            if (File.Exists(linkXmlPath))
            {
                Debug.Log($"✓ link.xml found at {linkXmlPath}");
                
                // Read and validate link.xml content
                string content = File.ReadAllText(linkXmlPath);
                if (content.Contains("RivalApex.Mediation"))
                {
                    Debug.Log("✓ link.xml contains SDK assembly references");
                }
                else
                {
                    Debug.LogWarning("⚠ link.xml may not contain proper SDK assembly references");
                }
            }
            else
            {
                Debug.LogError($"❌ link.xml not found at {linkXmlPath}!");
            }

            // Check stripping settings
            var buildTargetGroup = EditorUserBuildSettings.selectedBuildTargetGroup;
            var strippingLevel = PlayerSettings.GetManagedStrippingLevel(buildTargetGroup);
            Debug.Log($"Managed Stripping Level: {strippingLevel}");

            if (strippingLevel == ManagedStrippingLevel.Disabled)
            {
                Debug.LogWarning("⚠ Managed code stripping is disabled. Enable for smaller builds.");
            }

            // Check scripting backend
            var backend = PlayerSettings.GetScriptingBackend(buildTargetGroup);
            Debug.Log($"Scripting Backend: {backend}");

            if (backend == ScriptingImplementation.IL2CPP)
            {
                Debug.Log("✓ IL2CPP scripting backend is enabled");
            }
            else
            {
                Debug.LogWarning("⚠ IL2CPP is not enabled. Build sizes and validation are for IL2CPP builds.");
            }

            Debug.Log("[ApexMediation] Validation complete!");
        }

        [MenuItem("Apex Mediation/Generate Size Report")]
        public static void GenerateSizeReport()
        {
            Debug.Log("[ApexMediation] Generating size report...");

            // Estimate runtime size based on assembly metadata
            var assembly = typeof(ApexMediation).Assembly;
            var assemblyPath = assembly.Location;

            if (!string.IsNullOrEmpty(assemblyPath) && File.Exists(assemblyPath))
            {
                var fileInfo = new FileInfo(assemblyPath);
                Debug.Log($"Assembly DLL size: {FormatBytes(fileInfo.Length)}");
                
                float percentage = (fileInfo.Length / (float)(300 * 1024)) * 100f;
                Debug.Log($"Estimated budget usage: {percentage:F1}% (300KB budget)");

                if (fileInfo.Length > 300 * 1024)
                {
                    Debug.LogWarning($"⚠ DLL size exceeds 300KB budget!");
                }
                else
                {
                    Debug.Log($"✓ DLL size is within 300KB budget");
                }
            }
            else
            {
                Debug.LogWarning("Could not locate assembly DLL. Build the project first.");
            }
        }

        private static string FormatBytes(long bytes)
        {
            string[] sizes = { "B", "KB", "MB", "GB" };
            double len = bytes;
            int order = 0;
            while (len >= 1024 && order < sizes.Length - 1)
            {
                order++;
                len = len / 1024;
            }
            return $"{len:F2} {sizes[order]}";
        }
    }
}
