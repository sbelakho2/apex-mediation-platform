/**
 * Feature Flag Utilities
 * Centralized feature flag management for backend services
 */

export interface FeatureFlags {
  transparencyEnabled: boolean;
  billingEnabled: boolean;
  fraudDetectionEnabled: boolean;
  abTestingEnabled: boolean;
  mlCanaryEnabled: boolean;
  mlCanaryModelVersion: string;
  mlCanaryTrafficPercent: number;
}

/**
 * Get current feature flags from environment variables
 */
export const getFeatureFlags = (): FeatureFlags => {
  return {
    transparencyEnabled: process.env.TRANSPARENCY_ENABLED === 'true',
    billingEnabled: process.env.BILLING_ENABLED === 'true',
    fraudDetectionEnabled: process.env.FRAUD_DETECTION_ENABLED !== 'false', // Enabled by default
    abTestingEnabled: process.env.AB_TESTING_ENABLED === 'true',
    mlCanaryEnabled: process.env.ML_CANARY_ENABLED === 'true',
    mlCanaryModelVersion: process.env.ML_CANARY_MODEL_VERSION || 'stable',
    mlCanaryTrafficPercent: parseInt(process.env.ML_CANARY_TRAFFIC_PERCENT || '0', 10),
  };
};

/**
 * Check if a specific feature is enabled
 */
export const isFeatureEnabled = (feature: keyof FeatureFlags): boolean => {
  const flags = getFeatureFlags();
  const value = flags[feature];
  return typeof value === 'boolean' ? value : false;
};

/**
 * Middleware to guard routes based on feature flags
 */
export const requireFeature = (feature: keyof FeatureFlags) => {
  return (_req: any, res: any, next: any) => {
    if (!isFeatureEnabled(feature)) {
      return res.status(404).json({
        success: false,
        error: 'Feature not available',
        code: 'FEATURE_DISABLED',
      });
    }
    next();
  };
};
