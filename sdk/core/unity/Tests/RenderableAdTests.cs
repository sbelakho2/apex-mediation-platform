using System;
using Apex.Mediation.Core;
using Xunit;

public class RenderableAdTests
{
    [Fact]
    public void TryMarkShown_AllowsSingleUse()
    {
        var ad = new RenderableAd("placement", "adapter", TimeSpan.FromMinutes(5));
        Assert.True(ad.TryMarkShown());
        Assert.False(ad.TryMarkShown());
    }

    [Fact]
    public void TryTake_FromCacheHonorsTtl()
    {
        var cache = new AdCache();
        var ad = new RenderableAd("placement", "adapter", TimeSpan.FromMilliseconds(10));
        cache.TryStore(ad);
        Assert.True(cache.TryTake("placement", out _));
        Assert.False(cache.TryTake("placement", out _));
    }
}
