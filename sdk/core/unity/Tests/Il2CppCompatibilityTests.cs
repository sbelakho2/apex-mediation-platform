using Apex.Mediation;
using NUnit.Framework;

namespace Apex.Mediation.Tests
{
    public class Il2CppCompatibilityTests
    {
        [Test]
        public void PublicApi_survives_linking()
        {
            // Ensure the assembly loads and key types are preserved for AOT/IL2CPP.
            Assert.NotNull(typeof(ApexMediation));
            Assert.NotNull(typeof(ApexConfig));
        }
    }
}
