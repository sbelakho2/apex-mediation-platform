/**
 * ML Canary Deployment Utilities
 * 
 * Handles canary deployments for ML models by routing a percentage
 * of traffic to new model versions for gradual rollout.
 */

import { getFeatureFlags } from './featureFlags';
import crypto from 'crypto';
import type { Request, Response, NextFunction } from 'express';

export interface ModelSelection {
  version: string;
  isCanary: boolean;
}

/**
 * Determine which model version to use for a given request
 * 
 * @param requestId - Unique identifier for the request (user_id, session_id, etc.)
 * @param modelName - Name of the model (fraud_detection, ctr_prediction, etc.)
 * @returns ModelSelection indicating which version to use
 */
export const selectModelVersion = (requestId: string, modelName: string): ModelSelection => {
  const flags = getFeatureFlags();
  
  // If canary is disabled, always use stable
  if (!flags.mlCanaryEnabled) {
    return {
      version: 'stable',
      isCanary: false,
    };
  }
  
  // Calculate hash of requestId + modelName for consistent routing
  const hash = crypto.createHash('md5').update(`${requestId}:${modelName}`).digest('hex');
  const hashValue = parseInt(hash.substring(0, 8), 16);
  const bucket = hashValue % 100; // 0-99
  
  // Route traffic based on canary percentage
  if (bucket < flags.mlCanaryTrafficPercent) {
    return {
      version: flags.mlCanaryModelVersion,
      isCanary: true,
    };
  }
  
  return {
    version: 'stable',
    isCanary: false,
  };
};

/**
 * Get model endpoint URL based on version selection
 * 
 * @param modelName - Name of the model
 * @param selection - Model version selection
 * @returns URL to inference service endpoint
 */
export const getModelEndpoint = (modelName: string, selection: ModelSelection): string => {
  const baseUrl = process.env.ML_INFERENCE_SERVICE_URL || 'http://localhost:8000';
  
  if (selection.isCanary) {
    // Route to canary service or add version parameter
    const canaryUrl = process.env.ML_CANARY_SERVICE_URL || `${baseUrl}/canary`;
    return `${canaryUrl}/predict/${modelName}`;
  }
  
  return `${baseUrl}/predict/${modelName}`;
};

/**
 * Middleware to add ML model selection to request context
 * 
 * @param modelName - Name of the model being used
 */
type RequestWithModel = Request & {
  user?: { userId?: string };
  modelSelection?: ModelSelection;
  modelEndpoint?: string;
};

export const withModelSelection = (modelName: string) => {
  return (req: RequestWithModel, _res: Response, next: NextFunction) => {
    // Use user ID or generate request ID for consistent routing
    const headerId = Array.isArray(req.headers['x-request-id'])
      ? req.headers['x-request-id'][0]
      : req.headers['x-request-id'];
    const requestId = (req.user?.userId || headerId || crypto.randomUUID()) as string;
    
    // Select model version
    const modelSelection = selectModelVersion(requestId, modelName);
    
    // Attach to request
    req.modelSelection = modelSelection;
    req.modelEndpoint = getModelEndpoint(modelName, modelSelection);
    
    next();
  };
};

/**
 * Calculate canary traffic percentage from environment
 * Provides safe defaults and validation
 */
export const getCanaryTrafficPercent = (): number => {
  const percent = parseInt(process.env.ML_CANARY_TRAFFIC_PERCENT || '0', 10);
  
  // Clamp between 0 and 100
  return Math.max(0, Math.min(100, percent));
};

/**
 * Check if canary deployment is active
 */
export const isCanaryActive = (): boolean => {
  const flags = getFeatureFlags();
  return flags.mlCanaryEnabled && flags.mlCanaryTrafficPercent > 0;
};

/**
 * Get canary deployment status
 */
export const getCanaryStatus = () => {
  const flags = getFeatureFlags();
  
  return {
    enabled: flags.mlCanaryEnabled,
    version: flags.mlCanaryModelVersion,
    trafficPercent: flags.mlCanaryTrafficPercent,
    isActive: isCanaryActive(),
  };
};
