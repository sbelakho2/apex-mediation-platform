import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { User } from './entities/user.entity';
import { TwoFactorAuth } from './entities/twoFactorAuth.entity';
import { ApiKey } from './entities/apiKey.entity';
import { ApiKeyUsage } from './entities/apiKeyUsage.entity';
import { SkanPostback } from './entities/skanPostback.entity';
import { AdapterConfig } from './entities/adapterConfig.entity';
import { AuditTwofa } from './entities/auditTwofa.entity';
import config from '../config/index';

export const AppDataSource = new DataSource({
  type: 'postgres',
  url: config.databaseUrl,
  entities: [User, TwoFactorAuth, ApiKey, ApiKeyUsage, SkanPostback, AdapterConfig, AuditTwofa],
  migrations: ['src/migrations/*.ts'],
  // Disable synchronize to avoid destructive schema diffs; use migrations instead
  synchronize: false,
  logging: config.isDevelopment,
});

export async function initializeDatabase() {
  try {
    await AppDataSource.initialize();
    console.log('Data Source has been initialized!');
  } catch (err) {
    console.error('Error during Data Source initialization:', err);
    throw err;
  }
}
