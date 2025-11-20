using System.Collections.Generic;
using System.Linq;
using Apex.Mediation;
using Apex.Mediation.Adapters;
using Apex.Mediation.Core;
using UnityEditor;
using UnityEngine;

namespace Apex.Mediation.Editor
{
    public sealed class MediationManagerWindow : EditorWindow
    {
        private Vector2 _scroll;
        private string _search = string.Empty;
        private string _status = "";

        [MenuItem("Apex Mediation/Manager")]
        public static void ShowWindow()
        {
            var window = GetWindow<MediationManagerWindow>("Apex Mediation Manager");
            window.minSize = new Vector2(720, 480);
        }

        private void OnGUI()
        {
        EditorGUILayout.LabelField("Apex Mediation", EditorStyles.boldLabel);
        EditorGUILayout.HelpBox("Configure adapters, validate credentials, and inspect diagnostics.", MessageType.Info);

        DrawQuickActions();
        EditorGUILayout.Space();
        DrawAdapters();
        EditorGUILayout.Space();
        DrawDiagnostics();

        if (!string.IsNullOrEmpty(_status))
        {
            EditorGUILayout.HelpBox(_status, MessageType.None);
        }
    }

        private void DrawQuickActions()
        {
        EditorGUILayout.LabelField("Quick Actions", EditorStyles.boldLabel);
        using (new EditorGUILayout.HorizontalScope())
        {
            if (GUILayout.Button("Credential Wizard"))
            {
                AdapterCredentialWizard.ShowWindow();
            }

            if (GUILayout.Button("app-ads.txt Inspector"))
            {
                AppAdsInspectorWindow.ShowWindow();
            }

            if (GUILayout.Button("Migration Studio"))
            {
                MigrationStudioWindow.ShowWindow();
            }

            if (GUILayout.Button("Docs"))
            {
                Application.OpenURL("https://docs.rivalapexmediation.com");
            }

            if (GUILayout.Button("Config-as-Code"))
            {
                ConfigAsCodeWindow.ShowWindow();
            }
        }
    }

        private void DrawAdapters()
        {
        EditorGUILayout.LabelField("Adapters", EditorStyles.boldLabel);
        _search = EditorGUILayout.TextField("Search", _search);
        _scroll = EditorGUILayout.BeginScrollView(_scroll, GUILayout.Height(240));
        foreach (var metadata in FilterAdapters(_search))
        {
            EditorGUILayout.BeginVertical(EditorStyles.helpBox);
            EditorGUILayout.LabelField(metadata.Name, EditorStyles.largeLabel);
            EditorGUILayout.LabelField("Required Keys", string.Join(", ", metadata.RequiredCredentialKeys));
            EditorGUILayout.LabelField("app-ads.txt", string.Join(" | ", metadata.AppAdsLines));
            EditorGUILayout.LabelField("Docs", metadata.HelpUrl);

            using (new EditorGUILayout.HorizontalScope())
            {
                if (GUILayout.Button("Validate"))
                {
                    RunValidation(metadata.Name);
                }

                if (GUILayout.Button("Copy app-ads line"))
                {
                    EditorGUIUtility.systemCopyBuffer = string.Join("\n", metadata.AppAdsLines);
                    _status = $"Copied app-ads lines for {metadata.Name}";
                }
            }
            EditorGUILayout.EndVertical();
        }
        EditorGUILayout.EndScrollView();
    }

        private void DrawDiagnostics()
        {
        EditorGUILayout.LabelField("Diagnostics", EditorStyles.boldLabel);
        if (!Application.isPlaying || !ApexMediation.IsInitialized)
        {
            EditorGUILayout.HelpBox("Enter Play Mode and initialize the SDK to view live traces.", MessageType.Warning);
            return;
        }

        var traces = ApexMediation.GetTelemetryTraces();
        if (traces.Count == 0)
        {
            EditorGUILayout.HelpBox("No events recorded yet.", MessageType.Info);
            return;
        }

        foreach (var trace in traces.Reverse())
        {
            EditorGUILayout.LabelField($"[{trace.Timestamp:HH:mm:ss}] {trace.PlacementId} · {trace.Adapter} · {trace.Outcome} · {trace.Latency.TotalMilliseconds:F0} ms");
        }
    }

        private static IEnumerable<AdapterMetadata> FilterAdapters(string search)
        {
        var all = AdapterCatalog.AllAdapters();
        if (string.IsNullOrEmpty(search))
        {
            return all;
        }

        return all.Where(a => a.Name.ToLowerInvariant().Contains(search.ToLowerInvariant()));
    }

        private void RunValidation(string network)
        {
            var result = AdapterValidationUtility.Validate(network);
            _status = result.Success
                ? $"{network} validated: {result.Message}"
                : $"{network} failed: {result.Message} (missing: {string.Join(", ", result.MissingKeys)})";
        }
    }
}
