# Web SDK Integration Guide

Integrate ApexMediation into your web-based games and applications.

---

## Prerequisites

- Modern web browser (Chrome 90+, Firefox 88+, Safari 14+, Edge 90+)
- HTTPS website (required for ads)
- Active ApexMediation account with API credentials

---

## Installation

### CDN (Recommended)

Add to your HTML `<head>`:

```html
<script src="https://cdn.apexmediation.ee/sdk/v2/apexmediation.min.js"></script>
```

### NPM

```bash
npm install @rivalapex/web-sdk
```

```javascript
import ApexMediation from '@rivalapex/web-sdk';
```

### Yarn

```bash
yarn add @rivalapex/web-sdk
```

---

## Quick Start

### Basic Setup

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>My Game</title>
    <script src="https://cdn.apexmediation.ee/sdk/v2/apexmediation.min.js"></script>
</head>
<body>
    <div id="game-container"></div>

    <script>
        // Initialize SDK
        ApexMediation.initialize({
            publisherId: 'YOUR_PUBLISHER_ID',
            apiKey: 'YOUR_API_KEY',
            testMode: true, // Remove in production
            gdprConsent: true // Set based on user consent
        }).then(() => {
            console.log('ApexMediation initialized successfully');
            startGame();
        }).catch((error) => {
            console.error('ApexMediation initialization failed:', error);
        });
    </script>
</body>
</html>
```

---

## Ad Formats

### Display Ads (Banner)

**HTML:**

```html
<div id="banner-ad" style="width: 728px; height: 90px; margin: 0 auto;"></div>
```

**JavaScript:**

```javascript
// Create banner ad
const bannerAd = new ApexMediation.BannerAd({
    placementId: 'banner_main',
    container: document.getElementById('banner-ad'),
    size: { width: 728, height: 90 }
});

// Set event listeners
bannerAd.on('loaded', () => {
    console.log('Banner loaded');
});

bannerAd.on('error', (error) => {
    console.error('Banner error:', error);
});

bannerAd.on('clicked', () => {
    console.log('Banner clicked');
});

// Load and show
bannerAd.load();
```

**Standard Banner Sizes:**
- **Leaderboard**: 728x90
- **Medium Rectangle**: 300x250
- **Large Rectangle**: 336x280
- **Skyscraper**: 160x600
- **Wide Skyscraper**: 300x600

### Interstitial Ads

Full-screen ads that overlay your content:

```javascript
// Create interstitial
const interstitial = new ApexMediation.InterstitialAd({
    placementId: 'interstitial_level_complete'
});

// Set event listeners
interstitial.on('loaded', () => {
    console.log('Interstitial ready to show');
});

interstitial.on('shown', () => {
    console.log('Interstitial displayed');
    pauseGame(); // Pause your game
});

interstitial.on('closed', () => {
    console.log('Interstitial closed');
    resumeGame(); // Resume your game
    interstitial.load(); // Preload next ad
});

interstitial.on('error', (error) => {
    console.error('Interstitial error:', error);
});

// Preload
interstitial.load();

// Show when ready
function showInterstitial() {
    if (interstitial.isReady()) {
        interstitial.show();
    } else {
        console.warn('Interstitial not ready');
    }
}
```

### Rewarded Video Ads

Video ads that grant rewards:

```javascript
// Create rewarded video
const rewardedVideo = new ApexMediation.RewardedVideoAd({
    placementId: 'rewarded_extra_lives'
});

// Set event listeners
rewardedVideo.on('loaded', () => {
    console.log('Rewarded video ready');
    // Enable "Watch Video" button
    document.getElementById('watch-video-btn').disabled = false;
});

rewardedVideo.on('started', () => {
    console.log('User started watching');
});

rewardedVideo.on('rewarded', (reward) => {
    console.log(`User earned: ${reward.type} x${reward.amount}`);

    // Grant reward
    if (reward.type === 'coins') {
        player.addCoins(reward.amount);
    } else if (reward.type === 'lives') {
        player.addLives(reward.amount);
    }
});

rewardedVideo.on('closed', (completed) => {
    if (completed) {
        console.log('User completed video');
    } else {
        console.log('User closed early - no reward');
    }

    // Preload next video
    rewardedVideo.load();
});

rewardedVideo.on('error', (error) => {
    console.error('Rewarded video error:', error);
    alert('Video not available. Please try again later.');
});

// Preload
rewardedVideo.load();

// Show on button click
document.getElementById('watch-video-btn').addEventListener('click', () => {
    if (rewardedVideo.isReady()) {
        rewardedVideo.show();
    }
});
```

### Native Ads

Customizable ads that match your design:

```html
<div class="native-ad-container">
    <img id="native-icon" src="" alt="Ad Icon">
    <h3 id="native-title"></h3>
    <p id="native-description"></p>
    <button id="native-cta"></button>
</div>
```

```javascript
// Create native ad
const nativeAd = new ApexMediation.NativeAd({
    placementId: 'native_shop'
});

// Set event listeners
nativeAd.on('loaded', (assets) => {
    // Populate UI with ad content
    document.getElementById('native-icon').src = assets.iconUrl;
    document.getElementById('native-title').textContent = assets.title;
    document.getElementById('native-description').textContent = assets.description;
    document.getElementById('native-cta').textContent = assets.callToAction;

    // Register clickable elements
    nativeAd.registerClickableElements([
        document.getElementById('native-cta'),
        document.getElementById('native-icon')
    ]);

    // Track impression
    nativeAd.trackImpression();
});

nativeAd.on('clicked', () => {
    console.log('Native ad clicked');
});

nativeAd.on('error', (error) => {
    console.error('Native ad error:', error);
});

// Load
nativeAd.load();
```

---

## TypeScript Support

```typescript
import ApexMediation, {
    BannerAd,
    InterstitialAd,
    RewardedVideoAd,
    ApexMediationConfig,
    Reward
} from '@rivalapex/web-sdk';

// Initialize with config
const config: ApexMediationConfig = {
    publisherId: 'YOUR_PUBLISHER_ID',
    apiKey: 'YOUR_API_KEY',
    testMode: true,
    gdprConsent: true
};

ApexMediation.initialize(config).then(() => {
    console.log('Initialized');
});

// Create rewarded video with types
const rewarded = new RewardedVideoAd({
    placementId: 'rewarded_coins'
});

rewarded.on('rewarded', (reward: Reward) => {
    console.log(`Reward: ${reward.type} x${reward.amount}`);
});
```

---

## GDPR Compliance

### Check If GDPR Applies

```javascript
if (ApexMediation.isGDPRApplicable()) {
    // User is in EU - show consent dialog
    showConsentDialog();
}
```

### Show Consent Dialog

```javascript
// Using ApexMediation's built-in consent dialog
ApexMediation.showConsentDialog({
    privacyPolicyUrl: 'https://yoursite.com/privacy',
    onConsent: (consent) => {
        ApexMediation.setGDPRConsent(consent);
        initializeAds();
    }
});

// Or use your custom dialog
function showCustomConsentDialog() {
    const consentModal = document.getElementById('consent-modal');
    consentModal.style.display = 'block';

    document.getElementById('accept-btn').addEventListener('click', () => {
        ApexMediation.setGDPRConsent(true);
        consentModal.style.display = 'none';
        initializeAds();
    });

    document.getElementById('decline-btn').addEventListener('click', () => {
        ApexMediation.setGDPRConsent(false);
        consentModal.style.display = 'none';
        initializeAds();
    });
}
```

---

## COPPA Compliance

For websites directed at children under 13:

```javascript
ApexMediation.initialize({
    publisherId: 'YOUR_PUBLISHER_ID',
    apiKey: 'YOUR_API_KEY',
    coppaCompliant: true // Disables personalized ads
});
```

---

## Advanced Features

### Frequency Capping

Limit how often users see ads:

```javascript
ApexMediation.setFrequencyCap({
    interstitialMinInterval: 60, // seconds
    rewardedMinInterval: 300, // 5 minutes
    maxInterstitialsPerHour: 4
});
```

### Analytics

Track custom events:

```javascript
// Log custom event
ApexMediation.Analytics.logEvent('level_complete', {
    level: 10,
    score: 5000,
    time_seconds: 120
});

// Log purchase
ApexMediation.Analytics.logPurchase({
    itemId: 'premium_pack',
    price: 9.99,
    currency: 'USD'
});
```

### Preloading Multiple Ads

```javascript
// Preload multiple interstitials for different placements
const levelEndAd = new ApexMediation.InterstitialAd({
    placementId: 'interstitial_level_end'
});

const gameOverAd = new ApexMediation.InterstitialAd({
    placementId: 'interstitial_game_over'
});

// Load both
Promise.all([
    levelEndAd.load(),
    gameOverAd.load()
]).then(() => {
    console.log('All ads preloaded');
});
```

---

## Framework Integration

### React

```jsx
import { useEffect, useState } from 'react';
import ApexMediation from '@rivalapex/web-sdk';

function BannerAdComponent() {
    const [adLoaded, setAdLoaded] = useState(false);

    useEffect(() => {
        const banner = new ApexMediation.BannerAd({
            placementId: 'banner_main',
            container: document.getElementById('banner-container'),
            size: { width: 728, height: 90 }
        });

        banner.on('loaded', () => setAdLoaded(true));
        banner.load();

        // Cleanup
        return () => banner.destroy();
    }, []);

    return (
        <div id="banner-container" style={{
            width: 728,
            height: 90,
            margin: '0 auto'
        }}>
            {!adLoaded && <p>Loading ad...</p>}
        </div>
    );
}

export default BannerAdComponent;
```

### Vue.js

```vue
<template>
    <div>
        <div ref="bannerContainer" style="width: 728px; height: 90px;"></div>
    </div>
</template>

<script>
import ApexMediation from '@rivalapex/web-sdk';

export default {
    name: 'BannerAd',
    mounted() {
        this.banner = new ApexMediation.BannerAd({
            placementId: 'banner_main',
            container: this.$refs.bannerContainer,
            size: { width: 728, height: 90 }
        });

        this.banner.on('loaded', () => {
            console.log('Banner loaded');
        });

        this.banner.load();
    },
    beforeUnmount() {
        if (this.banner) {
            this.banner.destroy();
        }
    }
}
</script>
```

### Phaser.js

```javascript
class GameScene extends Phaser.Scene {
    constructor() {
        super({ key: 'GameScene' });
    }

    create() {
        // Create rewarded video
        this.rewardedVideo = new ApexMediation.RewardedVideoAd({
            placementId: 'rewarded_continue'
        });

        this.rewardedVideo.on('rewarded', (reward) => {
            // Grant continue
            this.continueGame();
        });

        this.rewardedVideo.load();
    }

    showGameOverScreen() {
        // Show "Watch Video to Continue" button
        const watchButton = this.add.text(400, 300, 'Watch Video to Continue', {
            fontSize: '32px',
            fill: '#fff'
        }).setInteractive();

        watchButton.on('pointerdown', () => {
            if (this.rewardedVideo.isReady()) {
                this.rewardedVideo.show();
            }
        });
    }
}
```

---

## Best Practices

### Ad Placement

✅ **DO**:
- Show interstitials between levels or during natural breaks
- Offer rewarded videos for optional bonuses
- Place banners in non-intrusive locations

❌ **DON'T**:
- Show ads during active gameplay
- Force users to watch ads for core features
- Cover important UI elements with banners

### Performance

```javascript
// Lazy load SDK for better initial page load
function loadApexMediationSDK() {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://cdn.apexmediation.ee/sdk/v2/apexmediation.min.js';
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
    });
}

// Load after game assets
loadGameAssets().then(() => {
    return loadApexMediationSDK();
}).then(() => {
    ApexMediation.initialize(config);
});
```

### Memory Management

```javascript
// Destroy ads when no longer needed
function cleanupAds() {
    if (bannerAd) {
        bannerAd.destroy();
        bannerAd = null;
    }

    if (interstitialAd) {
        interstitialAd.destroy();
        interstitialAd = null;
    }
}

// Call on page unload
window.addEventListener('beforeunload', cleanupAds);
```

---

## Troubleshooting

### Ads Not Showing

1. **Check browser console** for errors
2. **Verify HTTPS** - Ads require secure connection
3. **Check credentials** in dashboard
4. **Enable test mode** to verify integration
5. **Check ad blockers** - Ask users to disable

### CORS Errors

Ensure your website is served over HTTPS and has proper CORS headers.

### Performance Issues

```javascript
// Reduce ad refresh rate
ApexMediation.setConfig({
    bannerRefreshInterval: 60000, // 60 seconds (default: 30s)
    maxCachedAds: 2 // Reduce memory usage
});
```

---

## Testing

### Test Mode

```javascript
ApexMediation.initialize({
    publisherId: 'YOUR_PUBLISHER_ID',
    apiKey: 'YOUR_API_KEY',
    testMode: true // Shows test ads
});
```

### Test Domains

Add your development domains in dashboard:
- `localhost`
- `127.0.0.1`
- `*.yourdomain.test`

---

## Sample Projects

- **Vanilla JS**: [github.com/apexmediation/web-samples/vanilla](https://github.com/apexmediation/web-samples/vanilla)
- **React**: [github.com/apexmediation/web-samples/react](https://github.com/apexmediation/web-samples/react)
- **Vue**: [github.com/apexmediation/web-samples/vue](https://github.com/apexmediation/web-samples/vue)
- **Phaser**: [github.com/apexmediation/web-samples/phaser](https://github.com/apexmediation/web-samples/phaser)

---

## Support

- **Documentation**: [docs.apexmediation.ee](https://docs.apexmediation.ee)
- **Email**: support@apexmediation.ee
- **Discord**: [discord.gg/apexmediation](https://discord.gg/apexmediation)
- **Response Time**: < 24 hours

---

**Last Updated**: November 2025
**SDK Version**: 2.0.0
**Browser Support**: Chrome 90+, Firefox 88+, Safari 14+, Edge 90+
