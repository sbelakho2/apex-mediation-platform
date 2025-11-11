using NUnit.Framework;
using RivalApex.Mediation;

namespace RivalApex.Mediation.Tests
{
    /// <summary>
    /// Edit Mode tests for Logger utility
    /// </summary>
    [TestFixture]
    public class LoggerTests
    {
        [SetUp]
        public void SetUp()
        {
            Logger.SetDebugLogging(false);
        }
        
        [Test]
        public void SetDebugLogging_UpdatesState()
        {
            Assert.IsFalse(Logger.IsDebugEnabled);
            
            Logger.SetDebugLogging(true);
            Assert.IsTrue(Logger.IsDebugEnabled);
            
            Logger.SetDebugLogging(false);
            Assert.IsFalse(Logger.IsDebugEnabled);
        }
        
        [Test]
        public void RedactPII_RedactsEmail()
        {
            var input = "User email is test@example.com";
            var redacted = Logger.RedactPII(input);
            
            Assert.IsFalse(redacted.Contains("test@example.com"));
            StringAssert.Contains("[EMAIL_REDACTED]", redacted);
        }
        
        [Test]
        public void RedactPII_RedactsPhone()
        {
            var input = "Call 123-456-7890 for support";
            var redacted = Logger.RedactPII(input);
            
            Assert.IsFalse(redacted.Contains("123-456-7890"));
            StringAssert.Contains("[PHONE_REDACTED]", redacted);
        }
        
        [Test]
        public void RedactPII_RedactsLongIDs()
        {
            var input = "Device ID: 1234567890abcdef1234567890abcdef";
            var redacted = Logger.RedactPII(input);
            
            Assert.IsFalse(redacted.Contains("1234567890abcdef1234567890abcdef"));
            StringAssert.Contains("[ID_REDACTED]", redacted);
        }
        
        [Test]
        public void RedactPII_PreservesNonPII()
        {
            var input = "SDK version 1.0.0 on iOS 16.4";
            var redacted = Logger.RedactPII(input);
            
            Assert.AreEqual(input, redacted);
        }
        
        [Test]
        public void RedactPII_HandlesNullAndEmpty()
        {
            Assert.IsNull(Logger.RedactPII(null));
            Assert.AreEqual("", Logger.RedactPII(""));
        }
    }
}
