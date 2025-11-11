using NUnit.Framework;
using RivalApex.Mediation;

namespace RivalApex.Mediation.Tests
{
    /// <summary>
    /// Edit Mode tests for AdError
    /// </summary>
    [TestFixture]
    public class AdErrorTests
    {
        [Test]
        public void AdError_Constructor_SetsProperties()
        {
            var error = new AdError(AdErrorCode.NO_FILL, "No ads available", "Debug info");
            
            Assert.AreEqual(AdErrorCode.NO_FILL, error.Code);
            Assert.AreEqual("No ads available", error.Message);
            Assert.AreEqual("Debug info", error.DebugDetails);
        }
        
        [Test]
        public void AdError_ToString_IncludesCodeAndMessage()
        {
            var error = new AdError(AdErrorCode.TIMEOUT, "Request timed out");
            var result = error.ToString();
            
            StringAssert.Contains("TIMEOUT", result);
            StringAssert.Contains("Request timed out", result);
        }
        
        [Test]
        public void AdError_ToString_WithDebugDetails_IncludesDebug()
        {
            var error = new AdError(AdErrorCode.INTERNAL_ERROR, "Server error", "Stack trace here");
            var result = error.ToString();
            
            StringAssert.Contains("Debug: Stack trace here", result);
        }
        
        [Test]
        public void AdError_NoFill_CreatesCorrectError()
        {
            var error = AdError.NoFill();
            
            Assert.AreEqual(AdErrorCode.NO_FILL, error.Code);
            StringAssert.Contains("No ad available", error.Message);
        }
        
        [Test]
        public void AdError_Timeout_CreatesCorrectError()
        {
            var error = AdError.Timeout();
            
            Assert.AreEqual(AdErrorCode.TIMEOUT, error.Code);
            StringAssert.Contains("timed out", error.Message);
        }
        
        [Test]
        public void AdError_NetworkError_CreatesCorrectError()
        {
            var error = AdError.NetworkError("Connection failed");
            
            Assert.AreEqual(AdErrorCode.NETWORK_ERROR, error.Code);
            Assert.AreEqual("Connection failed", error.DebugDetails);
        }
        
        [Test]
        public void AdError_InvalidPlacement_IncludesPlacementId()
        {
            var error = AdError.InvalidPlacement("test-placement-123");
            
            Assert.AreEqual(AdErrorCode.INVALID_PLACEMENT, error.Code);
            StringAssert.Contains("test-placement-123", error.Message);
        }
        
        [Test]
        public void AdError_InternalError_WithDetails()
        {
            var error = AdError.InternalError("Detailed error info");
            
            Assert.AreEqual(AdErrorCode.INTERNAL_ERROR, error.Code);
            Assert.AreEqual("Detailed error info", error.DebugDetails);
        }
        
        [Test]
        public void AdError_AdExpired_CreatesCorrectError()
        {
            var error = AdError.AdExpired();
            
            Assert.AreEqual(AdErrorCode.AD_EXPIRED, error.Code);
            StringAssert.Contains("expired", error.Message);
        }
        
        [Test]
        public void AdError_NotInitialized_CreatesCorrectError()
        {
            var error = AdError.NotInitialized();
            
            Assert.AreEqual(AdErrorCode.NOT_INITIALIZED, error.Code);
            StringAssert.Contains("not initialized", error.Message);
        }
    }
}
