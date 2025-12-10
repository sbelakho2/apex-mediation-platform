# Unity SDK Integration

## Quick Start

### 1. Import SDK

1.  Download the `ApexMediation.unitypackage` from the [Releases Page](#).
2.  In Unity, go to **Assets > Import Package > Custom Package**.
3.  Select the downloaded file and click **Import**.

### 2. Resolve Dependencies

The SDK uses the External Dependency Manager for Unity (EDM4U) to handle Android and iOS dependencies.

1.  Go to **Assets > External Dependency Manager > Android Resolver > Force Resolve**.
2.  Ensure no errors are reported in the Console.

### 3. Initialize SDK

Create a script (e.g., `AdsManager.cs`) and attach it to a GameObject in your first scene.

```csharp
using ApexMediation.Unity;
using UnityEngine;

public class AdsManager : MonoBehaviour
{
    void Start()
    {
        ApexMediation.Initialize("YOUR_APP_ID", OnInitializationComplete);
    }

    private void OnInitializationComplete(InitializationStatus status)
    {
        if (status == InitializationStatus.Success)
        {
            Debug.Log("Apex SDK Initialized");
        }
    }
}
```

### 4. Load & Show Ad

```csharp
public void LoadInterstitial()
{
    ApexMediation.LoadInterstitial("PLACEMENT_ID");
}

public void ShowInterstitial()
{
    if (ApexMediation.IsInterstitialReady("PLACEMENT_ID"))
    {
        ApexMediation.ShowInterstitial("PLACEMENT_ID");
    }
}
```

## Key Concepts

*   **Platform Specific IDs**: You may have different App IDs and Placement IDs for Android and iOS. Use preprocessor directives (`#if UNITY_ANDROID`, `#if UNITY_IOS`) to switch between them.
*   **Main Thread**: All SDK calls must be made from the main Unity thread.

## Integration Checklist

1.  [ ] Imported Unity Package.
2.  [ ] Resolved Android/iOS dependencies via EDM4U.
3.  [ ] Configured App ID (handled platform differences).
4.  [ ] Verified ads on Android device.
5.  [ ] Verified ads on iOS device.

## Debugging

Enable debug logging:

```csharp
ApexMediation.SetLogLevel(LogLevel.Verbose);
```

Open Debugger:

```csharp
ApexMediation.OpenDebugger();
```
