using System;
using System.Collections.Generic;
using Apex.Mediation.Consent;
using Apex.Mediation.Internal;
using Apex.Mediation.Platforms;

namespace Apex.Mediation.Core
{
    internal sealed class MediationSDK
    {
        private static readonly Lazy<MediationSDK> LazyInstance = new(() => new MediationSDK());
        public static MediationSDK Instance => LazyInstance.Value;

        private ApexConfig? _config;
        private readonly EventPump _eventPump = new();
        private readonly AdCache _interstitialCache = new();
        private readonly AdCache _rewardedCache = new();
        private readonly ConsentManager _consentManager = new(true);
        private readonly TelemetryBuffer _telemetry = new();
        private readonly TransparencyLedger _ledger = new();
        private CredentialStore? _credentialStore;
        private IPlatformBridge? _bridge;
        private bool _initialized;
        private AdapterValidator? _validator;

        public ConsentManager ConsentManager => _consentManager;
        public bool IsInitialized => _initialized;
        public ApexConfig Config => _config ?? throw new InvalidOperationException("SDK not initialized");
        public IPlatformBridge PlatformBridge => _bridge ?? throw new InvalidOperationException("No platform bridge");
        public IReadOnlyList<TelemetryTrace> TelemetrySnapshot => _telemetry.Snapshot();
        public IReadOnlyList<TransparencyProof> TransparencySnapshot => _ledger.Snapshot();

        public void Initialize(ApexConfig config, Action<bool> onComplete)
        {
            if (_initialized)
            {
                Logger.LogWarning("SDK already initialized");
                onComplete?.Invoke(true);
                return;
            }

            _config = config ?? throw new ArgumentNullException(nameof(config));
            _credentialStore = new CredentialStore(config.AdapterConfigProvider);
            _consentManager.EnableAutoRead(config.EnableAutoConsentRead);
            UnityMainThread.Ensure();
            AppAdsInspector.WarnIfMissing(config.EnabledAdapters);

            _bridge = PlatformBridgeFactory.Create();
            _bridge.Initialize(config, _consentManager.GetConsentSnapshot(), _credentialStore);
            _validator = new AdapterValidator(this);
            _initialized = true;
            onComplete?.Invoke(true);
        }

        public void SetRuntimeCredential(string network, IReadOnlyDictionary<string, object?> config)
        {
            _credentialStore?.SetRuntimeConfig(network, config);
        }

        public bool ShouldUseS2S()
        {
            if (_config == null || _credentialStore == null)
            {
                return false;
            }

            return SdkModeDecider.ShouldUseS2S(_config.Mode, _config.EnabledAdapters, _credentialStore);
        }

        public void LoadInterstitial(string placementId, Action<bool, string?> callback)
        {
            InternalLoad("interstitial", placementId, callback, _interstitialCache, (extras, innerCallback) =>
                PlatformBridge.LoadInterstitial(placementId, extras, innerCallback));
        }

        public void ShowInterstitial(string placementId, Action<bool, string?> callback)
        {
            InternalShow(placementId, callback, _interstitialCache, () => PlatformBridge.ShowInterstitial(placementId, callback));
        }

        public void LoadRewarded(string placementId, Action<bool, string?> callback)
        {
            InternalLoad("rewarded", placementId, callback, _rewardedCache, (extras, innerCallback) =>
                PlatformBridge.LoadRewarded(placementId, extras, innerCallback));
        }

        public void ShowRewarded(string placementId, Action<bool, string?> callback)
        {
            InternalShow(placementId, callback, _rewardedCache, () => PlatformBridge.ShowRewarded(placementId, callback));
        }

        public void LoadBanner(string placementId, Action<bool, string?> callback)
        {
            InternalLoad("banner", placementId, callback, _interstitialCache, (extras, innerCallback) =>
                PlatformBridge.LoadBanner(placementId, extras, innerCallback));
        }

        public void AttachBanner(string placementId, IntPtr viewHandle)
        {
            PlatformBridge.AttachBanner(placementId, viewHandle);
        }

        public void DestroyBanner(string placementId)
        {
            PlatformBridge.DestroyBanner(placementId);
        }

        public void Shutdown()
        {
            _bridge?.Shutdown();
            _bridge = null;
            _initialized = false;
        }

        public void ValidateAdapter(string network, IReadOnlyDictionary<string, object?> credentials, Action<AdapterValidationResult> callback)
        {
            if (_validator == null)
            {
                callback?.Invoke(new AdapterValidationResult(network, false, "Validator unavailable"));
                return;
            }

            _validator.Validate(network, credentials, callback);
        }

        private void InternalLoad(string format, string placementId, Action<bool, string?> callback, AdCache cache, Action<Dictionary<string, object?>, Action<bool, string?>> loader)
        {
            if (!_initialized)
            {
                callback?.Invoke(false, "SDK not initialized");
                return;
            }

            var extras = CreateLoadExtras();
            extras["format"] = format;
            var start = DateTime.UtcNow;
            loader(extras, (success, error) =>
            {
                _eventPump.Enqueue(() =>
                {
                    if (success)
                    {
                        cache.TryStore(new RenderableAd(placementId, extras["adapter"]?.ToString() ?? "mock", Config.AdCacheTtl));
                    }

                    callback?.Invoke(success, error);
                    RecordTrace(placementId, format, success ? "load_success" : "load_failure", DateTime.UtcNow - start, extras);
                });
            });
        }

        private void InternalShow(string placementId, Action<bool, string?> callback, AdCache cache, Action showAction)
        {
            if (!cache.TryTake(placementId, out var ad))
            {
                callback?.Invoke(false, "Ad not ready or already shown");
                return;
            }

            showAction();
            callback?.Invoke(true, null);
            RecordTrace(placementId, ad.Adapter, "show", TimeSpan.Zero, new Dictionary<string, object?>());
        }

        private Dictionary<string, object?> CreateLoadExtras()
        {
            return new Dictionary<string, object?>
            {
                {"s2s", ShouldUseS2S()},
                {"adapter", PlatformBridge.PlatformName},
                {"consent", ConsentManager.GetConsentSnapshot().AsAdapterMap()}
            };
        }

        private void RecordTrace(string placementId, string adapter, string outcome, TimeSpan latency, Dictionary<string, object?> extras)
        {
            var sanitized = Redactor.RedactMap(extras);
            var trace = new TelemetryTrace(placementId, adapter, outcome, latency, sanitized);
            _telemetry.Record(trace);
            _ledger.Record(trace);
        }
    }
}
