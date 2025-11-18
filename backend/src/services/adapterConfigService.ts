import { AppDataSource } from '../database';
import { AdapterConfig } from '../database/entities/adapterConfig.entity';
import logger from '../utils/logger';
import config from '../config/index';
import { redis } from '../utils/redis';

type CacheState = {
  loadedAt: number;
  enabledNames: Set<string>;
  timeouts: Map<string, number>;
};

class AdapterConfigServiceImpl {
  private cache: CacheState = {
    loadedAt: 0,
    enabledNames: new Set(),
    timeouts: new Map(),
  };
  private timer: NodeJS.Timeout | null = null;

  initWatcher(): void {
    // Avoid multiple timers
    if (this.timer) return;
    const refresh = async () => {
      try {
        await this.refreshCache();
      } catch (e) {
        logger.warn('[AdapterConfig] refresh failed', { error: (e as Error).message });
      }
    };
    // Load immediately and then schedule
    void refresh();
    const intervalSec = Math.max(5, config.adapterRegistryRefreshSec || 60);
    this.timer = setInterval(refresh, intervalSec * 1000).unref();
    logger.info('[AdapterConfig] watcher initialized', { intervalSec });

    // Optional: subscribe to Redis pub/sub invalidation for near‑instant updates
    try {
      if (redis && typeof (redis as any).subscribe === 'function') {
        (redis as any).subscribe('adapter-configs:invalidate', async (_msg: string) => {
          try {
            logger.debug('[AdapterConfig] invalidation message received; refreshing cache');
            await this.refreshCache();
          } catch (e) {
            logger.warn('[AdapterConfig] invalidation refresh failed', { error: (e as Error).message });
          }
        });
        logger.info('[AdapterConfig] subscribed to Redis invalidation channel');
      }
    } catch (e) {
      logger.warn('[AdapterConfig] failed to subscribe to Redis invalidation channel', { error: (e as Error).message });
    }
  }

  async refreshCache(): Promise<void> {
    try {
      const repo = AppDataSource.getRepository(AdapterConfig);
      const rows = await repo.find();
      const enabled = new Set<string>();
      const timeouts = new Map<string, number>();
      for (const r of rows) {
        if (r.enabled) enabled.add(r.name);
        if (typeof r.timeoutMs === 'number' && r.timeoutMs > 0) {
          timeouts.set(r.name, r.timeoutMs);
        }
      }
      this.cache = {
        loadedAt: Date.now(),
        enabledNames: enabled,
        timeouts,
      };
      logger.debug('[AdapterConfig] cache refreshed', { count: rows.length, enabled: enabled.size });
    } catch (e) {
      // If DB unavailable, keep previous cache (fail-open to defaults)
      logger.warn('[AdapterConfig] failed to refresh; using previous cache', { error: (e as Error).message });
    }
  }

  isInitialized(): boolean {
    return this.cache.loadedAt > 0;
  }

  isEnabled(name: string): boolean {
    // If cache not initialized, fail-open to allow defaults
    if (!this.isInitialized()) return true;
    // If there are rows in DB but none enabled, then only those present in enabled set are allowed.
    return this.cache.enabledNames.size === 0 ? true : this.cache.enabledNames.has(name);
  }

  getTimeoutMs(name: string, dflt: number): number {
    return this.cache.timeouts.get(name) ?? dflt;
  }
}

export const adapterConfigService = new AdapterConfigServiceImpl();
export default adapterConfigService;
