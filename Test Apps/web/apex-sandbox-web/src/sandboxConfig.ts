export const sandboxConfig = {
  apiBase: 'https://staging-api.example.test',
  placements: {
    interstitialA: 'test_interstitial_a',
    interstitialB: 'test_interstitial_b',
    rewardedA: 'test_rewarded_a',
    bannerA: 'test_banner_a',
  },
  consent: {
    gdpr: false,
    ccpa: false,
    coppa: false,
    lat: true,
  },
} as const
