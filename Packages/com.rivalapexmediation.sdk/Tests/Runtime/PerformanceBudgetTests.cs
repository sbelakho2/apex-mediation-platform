using NUnit.Framework;
using UnityEngine;

namespace RivalApex.Mediation.Tests.Runtime
{
    /// <summary>
    /// Unit tests covering performance budget enforcement utilities.
    /// </summary>
    public class PerformanceBudgetTests
    {
        [Test]
        public void RequestPayloadBudget_IsEnforced()
        {
            var config = CreateConfig();
            config.RequestAllocationBudgetBytes = 50 * 1024;
            config.EnablePerformanceBudgetChecks = true;

            var host = new GameObject("PerfMonitorHost");
            var monitor = PerformanceBudgetMonitor.Ensure(host, config);

            Assert.IsNotNull(monitor, "Monitor should be created when feature is enabled");
            Assert.IsTrue(monitor.RecordRequestPayload(40 * 1024), "Expected payload within budget to succeed");
            Assert.IsFalse(monitor.RecordRequestPayload(60 * 1024), "Payload exceeding budget should be flagged");

            Object.DestroyImmediate(host);
        }

        [Test]
        public void IdleBudget_FlagsHardLimitBreaches()
        {
            var config = CreateConfig();
            config.IdleAllocationBudgetBytes = 1024;
            config.PerfRegressionTolerancePercent = 15f;
            config.EnablePerformanceBudgetChecks = true;

            var host = new GameObject("PerfMonitorIdle");
            var monitor = PerformanceBudgetMonitor.Ensure(host, config);

            Assert.IsTrue(monitor.EvaluateIdleSample(600));
            Assert.IsFalse(monitor.EvaluateIdleSample(2048));

            Object.DestroyImmediate(host);
        }

        [Test]
        public void IdleBudget_DetectsRegressionsBeyondTolerance()
        {
            var config = CreateConfig();
            config.IdleAllocationBudgetBytes = 4096;
            config.PerfRegressionTolerancePercent = 10f;
            config.EnablePerformanceBudgetChecks = true;

            var host = new GameObject("PerfMonitorRegression");
            var monitor = PerformanceBudgetMonitor.Ensure(host, config);

            Assert.IsTrue(monitor.EvaluateIdleSample(500)); // Baseline capture
            Assert.IsTrue(monitor.EvaluateIdleSample(540)); // +8% within tolerance
            Assert.IsFalse(monitor.EvaluateIdleSample(620)); // +24% beyond tolerance

            Object.DestroyImmediate(host);
        }

        private static SDKConfig CreateConfig()
        {
            var config = ScriptableObject.CreateInstance<SDKConfig>();
            config.AppId = "perf-test";
            config.ApiKey = "perf-test-key";
            return config;
        }
    }
}
