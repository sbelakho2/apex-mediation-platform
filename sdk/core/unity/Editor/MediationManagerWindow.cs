using UnityEditor;
using UnityEngine;

// Minimal EditorWindow scaffold for Mediation Manager
public class MediationManagerWindow : EditorWindow
{
    [MenuItem("Platform/Mediation Manager")]
    public static void ShowWindow()
    {
        var window = GetWindow<MediationManagerWindow>("Mediation Manager");
        window.minSize = new Vector2(600, 400);
    }

    private Vector2 scroll;

    private void OnGUI()
    {
        EditorGUILayout.LabelField("Mediation Manager", EditorStyles.boldLabel);
        EditorGUILayout.Space();

        scroll = EditorGUILayout.BeginScrollView(scroll);

        EditorGUILayout.LabelField("Placements", EditorStyles.label);
        // Placeholder for placement CRUD UI
        if (GUILayout.Button("Open Placements"))
        {
            Debug.Log("Open Placements clicked");
        }

        EditorGUILayout.Space();
        EditorGUILayout.LabelField("Adapters", EditorStyles.label);
        if (GUILayout.Button("Adapter Health"))
        {
            Debug.Log("Adapter Health clicked");
        }

        EditorGUILayout.Space();
        EditorGUILayout.LabelField("Payouts", EditorStyles.label);
        if (GUILayout.Button("Payout Health"))
        {
            Debug.Log("Payout Health clicked");
        }

        EditorGUILayout.EndScrollView();
    }
}
