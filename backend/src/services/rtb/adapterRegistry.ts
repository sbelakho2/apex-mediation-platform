import { AdapterDefinition, AdFormat } from './adapters/types';
import { mockAdmob } from './adapters/mockAdmob';
import { mockAppLovin } from './adapters/mockAppLovin';
import { mockUnityAds } from './adapters/mockUnityAds';
import adapterConfigService from '../../adapterConfigService';

const registry: AdapterDefinition[] = [];

export const registerDefaultAdapters = () => {
  if (registry.length > 0) return; // idempotent
  // Start adapter config watcher (TTL cache refresh)
  adapterConfigService.initWatcher();
  const defaults: AdapterDefinition[] = [mockAdmob(), mockAppLovin(), mockUnityAds()];
  // Filter by DB-backed enable flags; adjust timeouts when configured
  for (const a of defaults) {
    if (!adapterConfigService.isEnabled(a.name)) continue;
    const timeoutMs = adapterConfigService.getTimeoutMs(a.name, a.timeoutMs);
    registry.push({ ...a, timeoutMs });
  }
};

export const getAdaptersForFormat = (format: AdFormat): AdapterDefinition[] => {
  return registry.filter((a) => a.supports.includes(format));
};

export const getAllAdapters = (): AdapterDefinition[] => registry.slice();
