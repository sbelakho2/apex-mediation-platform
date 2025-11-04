import * as adapterConfigRepository from '../repositories/adapterConfigRepository';

export interface AdapterConfig {
  id: string;
  adapterId: string;
  adapterName: string;
  enabled: boolean;
  config: Record<string, unknown>;
  updatedAt: string;
}

export interface CreateAdapterConfigRequest {
  adapterId: string;
  config: Record<string, unknown>;
}

export interface UpdateAdapterConfigRequest {
  config: Record<string, unknown>;
}

/**
 * Get all adapter configs for a publisher
 */
export const getAdapterConfigs = async (
  publisherId: string
): Promise<AdapterConfig[]> => {
  const configs = await adapterConfigRepository.findByPublisherId(publisherId);

  return configs.map((config) => ({
    id: config.id,
    adapterId: config.adapter_id,
    adapterName: config.adapter_name,
    enabled: config.adapter_enabled,
    config: config.config,
    updatedAt: config.updated_at.toISOString(),
  }));
};

/**
 * Get a specific adapter config by ID
 */
export const getAdapterConfigById = async (
  id: string,
  publisherId: string
): Promise<AdapterConfig | null> => {
  const config = await adapterConfigRepository.findById(id, publisherId);

  if (!config) {
    return null;
  }

  return {
    id: config.id,
    adapterId: config.adapter_id,
    adapterName: config.adapter_name,
    enabled: config.adapter_enabled,
    config: config.config,
    updatedAt: config.updated_at.toISOString(),
  };
};

/**
 * Create a new adapter config
 */
export const createAdapterConfig = async (
  publisherId: string,
  request: CreateAdapterConfigRequest
): Promise<AdapterConfig> => {
  // Check if config already exists for this adapter
  const existing = await adapterConfigRepository.findByPublisherAndAdapter(
    publisherId,
    request.adapterId
  );

  if (existing) {
    throw new Error('Adapter config already exists for this publisher');
  }

  const created = await adapterConfigRepository.create({
    publisher_id: publisherId,
    adapter_id: request.adapterId,
    config: request.config,
  });

  // Fetch the full record with adapter details
  const fullConfig = await adapterConfigRepository.findById(created.id, publisherId);

  if (!fullConfig) {
    throw new Error('Failed to retrieve created adapter config');
  }

  return {
    id: fullConfig.id,
    adapterId: fullConfig.adapter_id,
    adapterName: fullConfig.adapter_name,
    enabled: fullConfig.adapter_enabled,
    config: fullConfig.config,
    updatedAt: fullConfig.updated_at.toISOString(),
  };
};

/**
 * Update an existing adapter config
 */
export const updateAdapterConfig = async (
  id: string,
  publisherId: string,
  request: UpdateAdapterConfigRequest
): Promise<AdapterConfig | null> => {
  const updated = await adapterConfigRepository.update(id, publisherId, {
    config: request.config,
  });

  if (!updated) {
    return null;
  }

  // Fetch the full record with adapter details
  const fullConfig = await adapterConfigRepository.findById(updated.id, publisherId);

  if (!fullConfig) {
    return null;
  }

  return {
    id: fullConfig.id,
    adapterId: fullConfig.adapter_id,
    adapterName: fullConfig.adapter_name,
    enabled: fullConfig.adapter_enabled,
    config: fullConfig.config,
    updatedAt: fullConfig.updated_at.toISOString(),
  };
};

/**
 * Delete an adapter config
 */
export const deleteAdapterConfig = async (
  id: string,
  publisherId: string
): Promise<boolean> => {
  return adapterConfigRepository.deleteById(id, publisherId);
};
