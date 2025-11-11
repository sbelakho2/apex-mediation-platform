import { AdapterDefinition, AdFormat } from './adapters/types';
import { mockAdmob } from './adapters/mockAdmob';
import { mockAppLovin } from './adapters/mockAppLovin';
import { mockUnityAds } from './adapters/mockUnityAds';

const registry: AdapterDefinition[] = [];

export const registerDefaultAdapters = () => {
  if (registry.length > 0) return; // idempotent
  registry.push(mockAdmob(), mockAppLovin(), mockUnityAds());
};

export const getAdaptersForFormat = (format: AdFormat): AdapterDefinition[] => {
  return registry.filter((a) => a.supports.includes(format));
};

export const getAllAdapters = (): AdapterDefinition[] => registry.slice();
