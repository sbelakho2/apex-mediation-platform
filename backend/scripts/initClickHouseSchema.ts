/**
 * Initialize ClickHouse Database Schema
 * 
 * Run this script to create all necessary tables and views in ClickHouse
 * Usage: ts-node scripts/initClickHouseSchema.ts
 */

import { createClient, ClickHouseClient } from '@clickhouse/client';
import { allSchemas } from '../src/utils/clickhouse.schema';
import dotenv from 'dotenv';

dotenv.config();

async function initializeSchema() {
  console.log('🚀 Starting ClickHouse schema initialization...\n');

  let client: ClickHouseClient | null = null;

  try {
    // Create database if it doesn't exist - connect without specifying database first
    const database = process.env.CLICKHOUSE_DATABASE || 'apexmediation';
    console.log(`📊 Creating database: ${database}`);
    
    // First, create client without database to create the database itself
    const tempClient = createClient({
      host: process.env.CLICKHOUSE_URL || 'http://localhost:8123',
      username: process.env.CLICKHOUSE_USER || 'default',
      password: process.env.CLICKHOUSE_PASSWORD || '',
      application: 'apexmediation-api-init',
    });
    
    await tempClient.command({
      query: `CREATE DATABASE IF NOT EXISTS ${database}`,
    });

    await tempClient.close();

    console.log(`✅ Database ${database} ready\n`);

    // Now connect with the database specified
    client = createClient({
      host: process.env.CLICKHOUSE_URL || 'http://localhost:8123',
      username: process.env.CLICKHOUSE_USER || 'default',
      password: process.env.CLICKHOUSE_PASSWORD || '',
      database: database,
      application: 'apexmediation-api-init',
    });

    // Execute each schema statement
    for (let i = 0; i < allSchemas.length; i++) {
      const schema = allSchemas[i];
      const schemaName = schema.split('\n')[0].replace(/^\/\*\*?\s*|\s*\*\/$/g, '').trim();
      
      console.log(`${i + 1}/${allSchemas.length} Creating: ${schemaName || 'Schema ' + (i + 1)}`);
      
      try {
        await client.command({
          query: schema,
        });
        console.log(`   ✅ Success\n`);
      } catch (error: unknown) {
        if (error instanceof Error) {
          console.error(`   ❌ Failed: ${error.message}\n`);
          throw error;
        }
        throw error;
      }
    }

    console.log('🎉 ClickHouse schema initialization completed successfully!');

    // Verify tables were created
    const result = await client.query({
      query: `
        SELECT name, engine, total_rows
        FROM system.tables
        WHERE database = '${database}'
        ORDER BY name
      `,
      format: 'JSONEachRow',
    });

    const tables = await result.json<{ name: string; engine: string; total_rows: string }>();
    
    console.log('\n📋 Created tables:');
    tables.forEach((table) => {
      console.log(`   - ${table.name} (${table.engine}) - ${table.total_rows} rows`);
    });

  } catch (error) {
    console.error('\n❌ Schema initialization failed:', error);
    process.exit(1);
  } finally {
    if (client) {
      await client.close();
    }
  }
}

// Run if called directly
if (require.main === module) {
  initializeSchema()
    .then(() => {
      console.log('\n✨ Done!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

export default initializeSchema;
