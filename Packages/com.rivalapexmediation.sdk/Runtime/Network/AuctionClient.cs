using System;
using System.Collections;
using System.Collections.Generic;
using System.Text;
using UnityEngine;
using UnityEngine.Networking;

namespace RivalApex.Mediation
{
    /// <summary>
    /// HTTP client for S2S auction requests with retry logic and error handling
    /// </summary>
    public class AuctionClient
    {
        private readonly SDKConfig _config;
        private readonly ConsentManager _consentManager;
        private readonly IPlatformBridge _platformBridge;
        
        public AuctionClient(SDKConfig config, ConsentManager consentManager, IPlatformBridge platformBridge)
        {
            _config = config;
            _consentManager = consentManager;
            _platformBridge = platformBridge;
        }
        
        /// <summary>
        /// Request ad bid from auction server
        /// </summary>
        public IEnumerator RequestBid(string placementId, AdType adType, Action<AdResponse, AdError> onComplete)
        {
            if (string.IsNullOrEmpty(placementId))
            {
                onComplete?.Invoke(null, AdError.InvalidPlacement(placementId));
                yield break;
            }
            
            // Build request
            var deviceInfo = BuildDeviceInfo();
            var consentData = _consentManager.GetConsent();
            var request = new AdRequest(
                placementId,
                adType,
                _config.AppId,
                deviceInfo,
                consentData,
                ApexMediation.Version,
                _config.TestMode
            );
            
            // Serialize to JSON
            string jsonPayload;
            try
            {
                jsonPayload = JsonUtility.ToJson(request);
            }
            catch (Exception e)
            {
                Logger.LogError($"Failed to serialize ad request: {e.Message}");
                onComplete?.Invoke(null, AdError.InternalError("JSON serialization failed"));
                yield break;
            }
            
            Logger.Log($"Requesting bid for placement: {placementId}, type: {adType}");
            
            // Make request with retry
            yield return RequestWithRetry(jsonPayload, 0, onComplete);
        }
        
        private IEnumerator RequestWithRetry(string jsonPayload, int attempt, Action<AdResponse, AdError> onComplete)
        {
            var url = $"{_config.AuctionEndpoint}/auction";
            
            using (var request = new UnityWebRequest(url, "POST"))
            {
                // Set body
                byte[] bodyRaw = Encoding.UTF8.GetBytes(jsonPayload);
                request.uploadHandler = new UploadHandlerRaw(bodyRaw);
                request.downloadHandler = new DownloadHandlerBuffer();

                // Track allocation against budget when monitor is available
                PerformanceBudgetMonitor.Instance?.RecordRequestPayload(bodyRaw.Length);
                
                // Set headers
                request.SetRequestHeader("Content-Type", "application/json");
                request.SetRequestHeader("X-Api-Key", _config.ApiKey);
                request.SetRequestHeader("User-Agent", _platformBridge.GetUserAgent());
                ApplyCorsHeaders(request, Application.platform);
                
                // Set timeout
                request.timeout = _config.RequestTimeout;
                
                // Send request
                yield return request.SendWebRequest();
                
                // Handle response
                var result = HandleResponse(request);
                
                // Retry logic for transient errors
                if (ShouldRetry(result.error, attempt))
                {
                    var retryDelay = CalculateRetryDelay(attempt);
                    Logger.Log($"Retrying request after {retryDelay}ms (attempt {attempt + 1}/{_config.MaxRetries + 1})");
                    yield return new WaitForSeconds(retryDelay / 1000f);
                    
                    yield return RequestWithRetry(jsonPayload, attempt + 1, onComplete);
                }
                else
                {
                    // Final result
                    onComplete?.Invoke(result.response, result.error);
                }
            }
        }
        
        private (AdResponse response, AdError error) HandleResponse(UnityWebRequest request)
        {
            // Check for network errors
            if (request.result == UnityWebRequest.Result.ConnectionError)
            {
                return (null, AdError.NetworkError(request.error));
            }
            
            if (request.result == UnityWebRequest.Result.DataProcessingError)
            {
                return (null, AdError.InternalError($"Data processing error: {request.error}"));
            }
            
            // Handle HTTP status codes
            var statusCode = request.responseCode;
            
            switch (statusCode)
            {
                case 200:
                    // Success - parse response
                    try
                    {
                        var responseText = request.downloadHandler.text;
                        var response = JsonUtility.FromJson<AdResponse>(responseText);
                        
                        if (response == null || string.IsNullOrEmpty(response.ad_id))
                        {
                            return (null, AdError.InternalError("Invalid response format"));
                        }
                        
                        Logger.Log($"Auction success: ad_id={response.ad_id}, adapter={response.adapter_name}");
                        return (response, null);
                    }
                    catch (Exception e)
                    {
                        Logger.LogError($"Failed to parse auction response: {e.Message}");
                        return (null, AdError.InternalError("Failed to parse response"));
                    }
                
                case 204:
                    // No fill
                    Logger.Log("Auction returned no fill");
                    return (null, AdError.NoFill());
                
                case 400:
                case 404:
                    // Invalid placement or bad request
                    return (null, AdError.InvalidPlacement("Bad request or placement not found"));
                
                case 401:
                case 403:
                    // Authentication failed
                    return (null, AdError.InvalidApiKey());
                
                case 429:
                    // Rate limited
                    return (null, AdError.RateLimit());
                
                case >= 500 and < 600:
                    // Server error (retryable)
                    return (null, AdError.InternalError($"Server error: {statusCode}"));
                
                default:
                    return (null, AdError.InternalError($"Unexpected status code: {statusCode}"));
            }
        }
        
        private bool ShouldRetry(AdError error, int attempt)
        {
            if (error == null || attempt >= _config.MaxRetries)
            {
                return false;
            }
            
            // Retry only for transient errors
            return error.Code == AdErrorCode.NETWORK_ERROR ||
                   error.Code == AdErrorCode.TIMEOUT ||
                   (error.Code == AdErrorCode.INTERNAL_ERROR && error.Message.Contains("Server error"));
        }
        
        private float CalculateRetryDelay(int attempt)
        {
            // Exponential backoff: 100ms * 2^attempt + random jitter (0-100ms)
            var baseDelay = 100f * Mathf.Pow(2, attempt);
            var jitter = UnityEngine.Random.Range(0f, 100f);
            return baseDelay + jitter;
        }
        
        private DeviceInfo BuildDeviceInfo()
        {
            return new DeviceInfo
            {
                platform = _platformBridge.PlatformName,
                os_version = SystemInfo.operatingSystem,
                device_model = SystemInfo.deviceModel,
                device_id = _platformBridge.GetDeviceId(),
                advertising_id = _platformBridge.GetAdvertisingId(),
                limit_ad_tracking = _platformBridge.IsLimitAdTrackingEnabled(),
                language = Application.systemLanguage.ToString(),
                screen_width = Screen.width,
                screen_height = Screen.height,
                screen_density = Screen.dpi > 0 ? Screen.dpi / 160f : 1f,
                user_agent = _platformBridge.GetUserAgent(),
                connection_type = _platformBridge.GetConnectionType()
            };
        }

        internal static void ApplyCorsHeaders(UnityWebRequest request, RuntimePlatform platform)
        {
            if (request == null)
            {
                return;
            }

            if (platform == RuntimePlatform.WebGLPlayer)
            {
                request.SetRequestHeader("Access-Control-Request-Method", "POST");
                request.SetRequestHeader("Access-Control-Request-Headers", "content-type,x-api-key");
            }
        }
    }
}
