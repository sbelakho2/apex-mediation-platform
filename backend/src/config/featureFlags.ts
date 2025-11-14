// Feature flags (in-memory overrides with env defaults)
// Risky features controlled here to enable fast mitigation/rollback in staging/production.

export type FeatureFlags = {
  killSwitch: boolean; // when true, API returns 503 for most routes
  enforce2fa: boolean; // when true, login requires 2FA step-up
  disableNewAdapters: boolean; // example flag to disable newly added adapters rollout
};

const envBool = (val: string | undefined, def = false) => {
  if (val == null) return def;
  const v = String(val).trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
};

let current: FeatureFlags = {
  killSwitch: envBool(process.env.FEATURE_KILL_SWITCH, false),
  enforce2fa: envBool(process.env.FEATURE_ENFORCE_2FA, false),
  disableNewAdapters: envBool(process.env.FEATURE_DISABLE_NEW_ADAPTERS, false),
};

export function getFeatureFlags(): FeatureFlags {
  return { ...current };
}

export function setFeatureFlags(partial: Partial<FeatureFlags>): FeatureFlags {
  current = { ...current, ...partial };
  return getFeatureFlags();
}

export function resetFeatureFlags(): void {
  current = {
    killSwitch: envBool(process.env.FEATURE_KILL_SWITCH, false),
    enforce2fa: envBool(process.env.FEATURE_ENFORCE_2FA, false),
    disableNewAdapters: envBool(process.env.FEATURE_DISABLE_NEW_ADAPTERS, false),
  };
}
