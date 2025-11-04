# Unity SDK Integration Guide

Get started with the ApexMediation Unity SDK in under 10 minutes.

---

## Prerequisites

- Unity 2020.3 or higher
- Target platforms: iOS 12+, Android 5.0+ (API 21)
- Active ApexMediation account with API credentials

---

## Installation

### Method 1: Unity Package Manager (Recommended)

1. Open Unity Package Manager (`Window > Package Manager`)
2. Click `+` → `Add package from git URL`
3. Enter: `https://github.com/apexmediation/unity-sdk.git`
4. Click `Add`

### Method 2: Manual Installation

1. Download the latest `.unitypackage` from [releases](https://github.com/apexmediation/unity-sdk/releases)
2. Import into Unity: `Assets > Import Package > Custom Package`
3. Select all files and click `Import`

---

## Initial Setup

### 1. Configure SDK

Create a new file at `Assets/Resources/ApexMediationSettings.asset`:

```csharp
using UnityEngine;
using ApexMediation;

[CreateAssetMenu(fileName = "ApexMediationSettings", menuName = "ApexMediation/Settings")]
public class ApexMediationSettings : ScriptableObject
{
    public string publisherId = "YOUR_PUBLISHER_ID";
    public string apiKey = "YOUR_API_KEY";
    public bool testMode = true;
}
```

### 2. Initialize SDK

Create an initialization script in your main scene:

```csharp
using UnityEngine;
using ApexMediation;

public class ApexMediationManager : MonoBehaviour
{
    void Start()
    {
        // Load settings
        var settings = Resources.Load<ApexMediationSettings>("ApexMediationSettings");

        // Initialize SDK
        ApexMediationSDK.Initialize(new ApexMediationConfig
        {
            PublisherId = settings.publisherId,
            ApiKey = settings.apiKey,
            TestMode = settings.testMode,
            GdprConsent = true, // Set based on user consent
            CoppaCompliant = false // Set to true for children's apps
        });

        // Listen for initialization complete
        ApexMediationSDK.OnInitialized += OnApexMediationInitialized;
    }

    private void OnApexMediationInitialized(bool success)
    {
        if (success)
        {
            Debug.Log("ApexMediation initialized successfully!");
        }
        else
        {
            Debug.LogError("ApexMediation initialization failed");
        }
    }
}
```

---

## Ad Formats

### Banner Ads

**Standard banner at bottom of screen:**

```csharp
using ApexMediation;

public class BannerExample : MonoBehaviour
{
    private BannerAd bannerAd;

    void Start()
    {
        // Create banner
        bannerAd = new BannerAd("banner_main_menu", BannerSize.Standard);

        // Set callbacks
        bannerAd.OnLoaded += () => Debug.Log("Banner loaded");
        bannerAd.OnClicked += () => Debug.Log("Banner clicked");
        bannerAd.OnLoadFailed += (error) => Debug.LogError($"Banner failed: {error}");

        // Load and show
        bannerAd.Load();
        bannerAd.Show(BannerPosition.Bottom);
    }

    void OnDestroy()
    {
        bannerAd?.Destroy();
    }
}
```

**Banner sizes:**
- `BannerSize.Standard` - 320x50
- `BannerSize.Large` - 320x100
- `BannerSize.MediumRectangle` - 300x250
- `BannerSize.Leaderboard` - 728x90 (tablets)

### Interstitial Ads

**Full-screen ads between game levels:**

```csharp
using ApexMediation;

public class InterstitialExample : MonoBehaviour
{
    private InterstitialAd interstitialAd;

    void Start()
    {
        // Create interstitial
        interstitialAd = new InterstitialAd("interstitial_level_complete");

        // Set callbacks
        interstitialAd.OnLoaded += () => Debug.Log("Interstitial ready");
        interstitialAd.OnShown += () => Debug.Log("Interstitial displayed");
        interstitialAd.OnClosed += () => OnInterstitialClosed();
        interstitialAd.OnLoadFailed += (error) => Debug.LogError($"Interstitial failed: {error}");

        // Preload
        interstitialAd.Load();
    }

    public void ShowInterstitial()
    {
        if (interstitialAd.IsReady())
        {
            interstitialAd.Show();
        }
        else
        {
            Debug.LogWarning("Interstitial not ready");
            // Reload
            interstitialAd.Load();
        }
    }

    private void OnInterstitialClosed()
    {
        Debug.Log("User closed interstitial");
        // Preload next ad
        interstitialAd.Load();
        // Continue game flow
        LoadNextLevel();
    }
}
```

### Rewarded Video Ads

**Watch video to earn rewards:**

```csharp
using ApexMediation;

public class RewardedVideoExample : MonoBehaviour
{
    private RewardedVideoAd rewardedAd;

    void Start()
    {
        // Create rewarded video
        rewardedAd = new RewardedVideoAd("rewarded_extra_lives");

        // Set callbacks
        rewardedAd.OnLoaded += () => Debug.Log("Rewarded video ready");
        rewardedAd.OnShown += () => Debug.Log("User watching video");
        rewardedAd.OnRewarded += OnUserRewarded;
        rewardedAd.OnClosed += OnRewardedClosed;
        rewardedAd.OnLoadFailed += (error) => Debug.LogError($"Rewarded failed: {error}");

        // Preload
        rewardedAd.Load();
    }

    public void ShowRewardedVideo()
    {
        if (rewardedAd.IsReady())
        {
            rewardedAd.Show();
        }
        else
        {
            Debug.LogWarning("Rewarded video not ready");
            ShowErrorMessage("Video not available. Try again later.");
        }
    }

    private void OnUserRewarded(Reward reward)
    {
        Debug.Log($"User earned reward: {reward.Type} x{reward.Amount}");

        // Grant reward to user
        switch (reward.Type)
        {
            case "coins":
                PlayerInventory.AddCoins(reward.Amount);
                break;
            case "lives":
                PlayerInventory.AddLives(reward.Amount);
                break;
        }
    }

    private void OnRewardedClosed(bool completed)
    {
        if (completed)
        {
            Debug.Log("User completed video");
        }
        else
        {
            Debug.Log("User skipped video early");
        }

        // Preload next video
        rewardedAd.Load();
    }
}
```

### Native Ads

**Customizable ads that match your UI:**

```csharp
using ApexMediation;
using UnityEngine.UI;

public class NativeAdExample : MonoBehaviour
{
    private NativeAd nativeAd;

    [SerializeField] private Text titleText;
    [SerializeField] private Text descriptionText;
    [SerializeField] private RawImage iconImage;
    [SerializeField] private Button ctaButton;

    void Start()
    {
        // Create native ad
        nativeAd = new NativeAd("native_shop");

        // Set callbacks
        nativeAd.OnLoaded += OnNativeAdLoaded;
        nativeAd.OnClicked += () => Debug.Log("Native ad clicked");
        nativeAd.OnLoadFailed += (error) => Debug.LogError($"Native ad failed: {error}");

        // Load
        nativeAd.Load();
    }

    private void OnNativeAdLoaded(NativeAdAssets assets)
    {
        // Populate UI with ad content
        titleText.text = assets.Title;
        descriptionText.text = assets.Description;
        ctaButton.GetComponentInChildren<Text>().text = assets.CallToAction;

        // Load icon image
        StartCoroutine(LoadImage(assets.IconUrl, iconImage));

        // Register clickable views
        nativeAd.RegisterViews(
            gameObject,
            new[] { ctaButton.gameObject, iconImage.gameObject }
        );
    }

    private IEnumerator LoadImage(string url, RawImage target)
    {
        using (UnityWebRequest www = UnityWebRequestTexture.GetTexture(url))
        {
            yield return www.SendWebRequest();
            if (www.result == UnityWebRequest.Result.Success)
            {
                target.texture = DownloadHandlerTexture.GetContent(www);
            }
        }
    }
}
```

---

## Ad Placement Best Practices

### Interstitials
✅ **DO**: Show between levels, after achievements, during natural breaks
❌ **DON'T**: Show during gameplay, on app launch, more than once per minute

### Rewarded Videos
✅ **DO**: Offer clear value (extra lives, coins, power-ups)
✅ **DO**: Make it optional (never force users to watch)
❌ **DON'T**: Gate core gameplay behind ads

### Banners
✅ **DO**: Place at top or bottom of screen
✅ **DO**: Remove during core gameplay (distracting)
❌ **DON'T**: Cover important UI elements

---

## GDPR Compliance

For users in the EU, you must obtain consent before showing personalized ads:

```csharp
using ApexMediation;

public class GDPRConsentManager : MonoBehaviour
{
    void Start()
    {
        // Check if user is in EU
        if (ApexMediationSDK.IsGdprApplicable())
        {
            // Show consent dialog
            ShowConsentDialog((consent) =>
            {
                ApexMediationSDK.SetGdprConsent(consent);
                InitializeAds();
            });
        }
        else
        {
            // Not in EU, no consent needed
            InitializeAds();
        }
    }

    private void ShowConsentDialog(System.Action<bool> callback)
    {
        // Your custom consent UI
        // Or use ApexMediation's built-in consent dialog:
        ApexMediationSDK.ShowConsentDialog((consent) =>
        {
            callback(consent);
        });
    }
}
```

---

## COPPA Compliance

For apps directed at children under 13 (US):

```csharp
ApexMediationSDK.Initialize(new ApexMediationConfig
{
    PublisherId = "YOUR_PUBLISHER_ID",
    ApiKey = "YOUR_API_KEY",
    CoppaCompliant = true, // Disables personalized ads
    TestMode = false
});
```

---

## Testing

### Test Mode

Enable test mode to receive test ads (no revenue, safe for development):

```csharp
ApexMediationSDK.Initialize(new ApexMediationConfig
{
    PublisherId = "YOUR_PUBLISHER_ID",
    ApiKey = "YOUR_API_KEY",
    TestMode = true // Remove in production!
});
```

### Test Device IDs

To test real ads without affecting stats:

```csharp
ApexMediationSDK.AddTestDevice("YOUR_DEVICE_ID");
```

Find your device ID in Unity Console on first SDK initialization.

---

## Ad Mediation

ApexMediation automatically mediates across 20+ ad networks for maximum fill rate and revenue.

### Enable Mediation

No code changes needed - mediation is automatic. Configure in dashboard:

1. Go to [dashboard.apexmediation.ee](https://dashboard.apexmediation.ee)
2. Navigate to **Mediation > Waterfall**
3. Enable ad networks
4. Set floor prices

**Supported networks:**
- AdMob (Google)
- Meta Audience Network
- Unity Ads
- AppLovin
- IronSource
- Vungle
- And 15+ more

---

## Analytics

Track custom events for deeper insights:

```csharp
using ApexMediation;

public class AnalyticsExample : MonoBehaviour
{
    void OnLevelComplete(int level, int score)
    {
        ApexMediationAnalytics.LogEvent("level_complete", new Dictionary<string, object>
        {
            { "level", level },
            { "score", score },
            { "time_seconds", Time.time }
        });
    }

    void OnPurchase(string itemId, decimal price)
    {
        ApexMediationAnalytics.LogPurchase(itemId, price, "USD");
    }
}
```

---

## Advanced Features

### A/B Testing

Test different ad placements automatically:

```csharp
// ApexMediation automatically assigns users to experiments
// No code changes needed - configure in dashboard
```

### Frequency Capping

Limit how often users see ads:

```csharp
ApexMediationSDK.SetFrequencyCap(new FrequencyCap
{
    InterstitialMinInterval = 60, // seconds
    RewardedMinInterval = 300, // 5 minutes
    MaxInterstitialsPerHour = 4
});
```

---

## Troubleshooting

### Ads Not Showing

1. **Check initialization**: Ensure `ApexMediationSDK.OnInitialized` fires successfully
2. **Verify credentials**: Check Publisher ID and API Key in dashboard
3. **Test mode**: Enable test mode to verify integration
4. **Internet connection**: Ads require active internet
5. **Fill rate**: No ads available for your region (rare)

### Low Fill Rate

1. **Enable mediation**: Add more ad networks in dashboard
2. **Check floor prices**: Lower floor prices increase fill
3. **Geographic location**: Fill rates vary by country
4. **App category**: Some categories have higher demand

### Performance Issues

```csharp
// Reduce memory usage
ApexMediationSDK.SetConfig(new ApexMediationConfig
{
    MaxCachedAds = 2, // Default: 3
    ImageCacheSize = 10 * 1024 * 1024, // 10 MB (default: 50 MB)
    VideoCacheEnabled = false // Disable if not using video ads
});
```

---

## Migration from Other SDKs

### From Unity Ads

```csharp
// Unity Ads
Advertisement.Show("rewardedVideo");

// ApexMediation equivalent
rewardedAd.Show();
```

### From AdMob

```csharp
// AdMob
RewardedAd.Load("ca-app-pub-xxx", ...);

// ApexMediation equivalent
var rewardedAd = new RewardedVideoAd("rewarded_placement");
rewardedAd.Load();
```

---

## Sample Projects

Download complete sample projects:

- **Hypercasual Game**: [github.com/apexmediation/unity-samples/hypercasual](https://github.com/apexmediation/unity-samples/hypercasual)
- **RPG Game**: [github.com/apexmediation/unity-samples/rpg](https://github.com/apexmediation/unity-samples/rpg)
- **Puzzle Game**: [github.com/apexmediation/unity-samples/puzzle](https://github.com/apexmediation/unity-samples/puzzle)

---

## Support

- **Documentation**: [docs.apexmediation.ee](https://docs.apexmediation.ee)
- **Email**: support@bel-consulting.ee
- **Discord**: [discord.gg/apexmediation](https://discord.gg/apexmediation)
- **Response Time**: < 24 hours (Premium: < 4 hours)

---

**Last Updated**: November 2025
**SDK Version**: 2.0.0
**Unity Version**: 2020.3+
