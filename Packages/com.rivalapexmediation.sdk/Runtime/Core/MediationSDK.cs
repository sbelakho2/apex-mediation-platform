using System;
using System.Collections;
using UnityEngine;

namespace RivalApex.Mediation
{
    /// <summary>
    /// Singleton MonoBehaviour that manages SDK lifecycle
    /// </summary>
    internal class MediationSDK : MonoBehaviour
    {
        private static MediationSDK _instance;
        private static readonly object _lock = new object();
        
        private SDKConfig _config;
        private ConsentManager _consentManager;
        private IPlatformBridge _platformBridge;
        private AuctionClient _auctionClient;
        private RemoteConfigClient _remoteConfigClient;
    private PerformanceBudgetMonitor _performanceMonitor;
        
        private bool _isInitialized = false;
        private bool _isInitializing = false;
        
        public static MediationSDK Instance
        {
            get
            {
                if (_instance == null)
                {
                    lock (_lock)
                    {
                        if (_instance == null)
                        {
                            // Find existing instance
                            _instance = FindObjectOfType<MediationSDK>();
                            
                            if (_instance == null)
                            {
                                // Create new GameObject with MediationSDK
                                var go = new GameObject("ApexMediationSDK");
                                _instance = go.AddComponent<MediationSDK>();
                                DontDestroyOnLoad(go);
                                Logger.Log("MediationSDK singleton created");
                            }
                        }
                    }
                }
                return _instance;
            }
        }
        
        public bool IsInitialized => _isInitialized;
        public ConsentManager ConsentManager => _consentManager;
        public AuctionClient AuctionClient => _auctionClient;
        public SDKConfig Config => _config;
        public IPlatformBridge PlatformBridge => _platformBridge;
        
        private void Awake()
        {
            if (_instance != null && _instance != this)
            {
                Destroy(gameObject);
                return;
            }
            
            _instance = this;
            DontDestroyOnLoad(gameObject);
        }
        
        public void Initialize(SDKConfig config, Action<bool> onComplete)
        {
            if (_isInitialized)
            {
                Logger.LogWarning("SDK already initialized");
                onComplete?.Invoke(true);
                return;
            }
            
            if (_isInitializing)
            {
                Logger.LogWarning("SDK initialization already in progress");
                return;
            }
            
            _isInitializing = true;
            StartCoroutine(InitializeCoroutine(config, onComplete));
        }
        
        private IEnumerator InitializeCoroutine(SDKConfig config, Action<bool> onComplete)
        {
            Logger.Log($"Initializing Apex Mediation SDK v{ApexMediation.Version}");
            
            // Validate config
            if (config == null)
            {
                Logger.LogError("SDKConfig is null");
                _isInitializing = false;
                onComplete?.Invoke(false);
                yield break;
            }
            
            config.Validate();
            
            if (string.IsNullOrEmpty(config.AppId) || string.IsNullOrEmpty(config.ApiKey))
            {
                Logger.LogError("Invalid SDKConfig: AppId and ApiKey are required");
                _isInitializing = false;
                onComplete?.Invoke(false);
                yield break;
            }
            
            _config = config;
            
            // Set logging level
            Logger.SetDebugLogging(config.DebugLogging);
            
            // Initialize platform bridge
            _platformBridge = InitializePlatformBridge();
            Logger.Log($"Platform: {_platformBridge.PlatformName}");
            
            // Initialize consent manager
            _consentManager = new ConsentManager();
            Logger.Log($"Consent: {_consentManager.GetRedactedConsentInfo()}");
            
            // Initialize auction client
            _auctionClient = new AuctionClient(_config, _consentManager, _platformBridge);

            // Enable performance monitoring when requested
            _performanceMonitor = PerformanceBudgetMonitor.Ensure(gameObject, _config);

            // OTA remote config (fetch + merge with local)
            _remoteConfigClient = new RemoteConfigClient(_config);
            yield return _remoteConfigClient.FetchAndMerge((success, version) =>
            {
                if (success)
                {
                    Logger.Log($"Remote config loaded (version={version})");
                }
                else
                {
                    Logger.LogWarning("Remote config fetch failed; continuing with local config");
                }
            });
            
            _isInitialized = true;
            _isInitializing = false;
            
            Logger.Log("SDK initialized successfully");
            onComplete?.Invoke(true);
        }
        
        private IPlatformBridge InitializePlatformBridge()
        {
#if UNITY_IOS && !UNITY_EDITOR
            return new IOSPlatformBridge();
#elif UNITY_ANDROID && !UNITY_EDITOR
            return new AndroidPlatformBridge();
#elif UNITY_WEBGL && !UNITY_EDITOR
            return new WebGLPlatformBridge();
#else
            return new StandalonePlatformBridge();
#endif
        }
        
        private void OnApplicationPause(bool pauseStatus)
        {
            if (!_isInitialized) return;
            
            if (pauseStatus)
            {
                Logger.Log("Application paused");
            }
            else
            {
                Logger.Log("Application resumed");
            }
        }
        
        private void OnApplicationQuit()
        {
            if (!_isInitialized) return;
            
            Logger.Log("Application quitting - cleaning up SDK");
        }
        
        private void OnDestroy()
        {
            if (_instance == this)
            {
                _instance = null;
            }
        }
    }
}
