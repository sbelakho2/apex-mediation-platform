import dotenv from 'dotenv';

dotenv.config();

const config = {
  isDevelopment: process.env.NODE_ENV === 'development',
  databaseUrl: process.env.DATABASE_URL || 'postgresql://postgres:postgres@postgres:5432/apexmediation',
  // Batch-2 feature flags and knobs
  clickhouseRequired: process.env.CLICKHOUSE_REQUIRED === '1',
  useRedisStreamsForAnalytics: process.env.USE_REDIS_STREAMS_FOR_ANALYTICS === '1',
  useKafkaForAnalytics: process.env.USE_KAFKA_FOR_ANALYTICS === '1',
  adapterRegistryRefreshSec: parseInt(process.env.ADAPTER_REGISTRY_REFRESH_SEC || '60', 10),
  redisBreakersEnabled: process.env.REDIS_BREAKERS_ENABLED === '1',
  logToFiles: process.env.LOG_TO_FILES === '1',
};

export default config;
