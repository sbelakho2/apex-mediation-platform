using UnityEngine;
#if UNITY_2020_2_OR_NEWER
using Unity.Profiling;
#endif

namespace RivalApex.Mediation
{
    /// <summary>
    /// Lightweight runtime monitor that enforces request and idle allocation budgets.
    /// Uses Unity profiler data when available and falls back to manual sampling in tests.
    /// </summary>
    internal class PerformanceBudgetMonitor : MonoBehaviour
    {
        private static PerformanceBudgetMonitor _instance;

        private long _requestBudgetBytes = 50 * 1024;
        private long _idleBudgetBytes = 1024;
        private float _regressionTolerancePercent = 10f;
        private long _baselineIdleBytes;
        private bool _hasBaseline;

        internal long LastRequestPayloadBytes { get; private set; }
        internal long LastIdleSampleBytes { get; private set; }

#if UNITY_2020_2_OR_NEWER
        private ProfilerRecorder _gcAllocRecorder;
#endif

        internal static PerformanceBudgetMonitor Instance => _instance;

        private void Awake()
        {
            if (_instance != null && _instance != this)
            {
                Destroy(this);
                return;
            }

            _instance = this;
        }

        private void OnDestroy()
        {
            if (_instance == this)
            {
#if UNITY_2020_2_OR_NEWER
                if (_gcAllocRecorder.Valid)
                {
                    _gcAllocRecorder.Dispose();
                }
#endif
                _instance = null;
            }
        }

        /// <summary>
        /// Configure budgets and start sampling.
        /// </summary>
        internal void Configure(SDKConfig config)
        {
            _requestBudgetBytes = Mathf.Max(1024, config.RequestAllocationBudgetBytes);
            _idleBudgetBytes = Mathf.Max(256, config.IdleAllocationBudgetBytes);
            _regressionTolerancePercent = Mathf.Clamp(config.PerfRegressionTolerancePercent, 1f, 100f);
            _hasBaseline = false;
            LastIdleSampleBytes = 0;
            LastRequestPayloadBytes = 0;

#if UNITY_2020_2_OR_NEWER
            if (_gcAllocRecorder.Valid)
            {
                _gcAllocRecorder.Dispose();
            }

            _gcAllocRecorder = ProfilerRecorder.StartNew(ProfilerCategory.Memory, "GC Allocated In Frame", 128);
#endif
        }

        private void LateUpdate()
        {
#if UNITY_2020_2_OR_NEWER
            if (_gcAllocRecorder.Valid)
            {
                var sample = _gcAllocRecorder.LastValue;
                EvaluateIdleSample(sample);
            }
#endif
        }

        /// <summary>
        /// Evaluate an idle allocation sample against the configured budget and regression guard rails.
        /// Returns true when within budget, false when a threshold is exceeded.
        /// </summary>
        internal bool EvaluateIdleSample(long bytes)
        {
            LastIdleSampleBytes = bytes;

            if (!_hasBaseline)
            {
                _baselineIdleBytes = bytes;
                _hasBaseline = true;
                return true;
            }

            var regressionCeiling = _baselineIdleBytes * (1f + _regressionTolerancePercent / 100f);

            if (bytes > _idleBudgetBytes)
            {
                Logger.LogWarning($"[ApexMediation] Idle GC allocations {bytes}B exceed budget {_idleBudgetBytes}B");
                return false;
            }

            if (bytes > regressionCeiling)
            {
                Logger.LogWarning($"[ApexMediation] Idle GC allocations {bytes}B exceed regression ceiling {regressionCeiling:F0}B");
                return false;
            }

            return true;
        }

        /// <summary>
        /// Record a request payload allocation. Returns true when within budget, false otherwise.
        /// </summary>
        internal bool RecordRequestPayload(int payloadBytes)
        {
            LastRequestPayloadBytes = payloadBytes;

            if (payloadBytes <= _requestBudgetBytes)
            {
                return true;
            }

            Logger.LogWarning($"[ApexMediation] Request payload size {payloadBytes}B exceeds budget {_requestBudgetBytes}B");
            return false;
        }

        /// <summary>
        /// Ensure a monitor exists on the provided host GameObject when the feature is enabled.
        /// </summary>
        internal static PerformanceBudgetMonitor Ensure(GameObject host, SDKConfig config)
        {
            if (config == null || !config.EnablePerformanceBudgetChecks)
            {
                return null;
            }

            var monitor = host.GetComponent<PerformanceBudgetMonitor>();
            if (monitor == null)
            {
                monitor = host.AddComponent<PerformanceBudgetMonitor>();
            }

            monitor.Configure(config);
            return monitor;
        }
    }
}
