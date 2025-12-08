using System;
using System.Threading;
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

    [Fact]
    public void TryTake_FailsAfterExpiry()
    {
        var cache = new AdCache();
        var ad = new RenderableAd("placement", "adapter", TimeSpan.FromMilliseconds(5));
        cache.TryStore(ad);

        Thread.Sleep(20);

        Assert.False(cache.TryTake("placement", out _));
    }

    [Fact]
    public void TryStore_ReplacesExistingPlacementEntry()
    {
        var cache = new AdCache();
        var first = new RenderableAd("placement", "adapterA", TimeSpan.FromMinutes(1));
        var second = new RenderableAd("placement", "adapterB", TimeSpan.FromMinutes(1));

        cache.TryStore(first);
        cache.TryStore(second);

        Assert.True(cache.TryTake("placement", out var final));
        Assert.Equal("adapterB", final.Adapter);
    }
}
