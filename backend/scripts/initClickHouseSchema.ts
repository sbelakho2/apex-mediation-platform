/**
 * Initialize ClickHouse Database Schema
 * 
 * Run this script to create all necessary tables and views in ClickHouse
 * Usage: ts-node scripts/initClickHouseSchema.ts
 */

import { initializeClickHouse, getClickHouseClient, closeClickHouse } from '../src/utils/clickhouse';
import { allSchemas } from '../src/utils/clickhouse.schema';
import dotenv from 'dotenv';

dotenv.config();

async function initializeSchema() {
  console.log('🚀 Starting ClickHouse schema initialization...\n');

  try {
    // Initialize connection
    await initializeClickHouse();
    const client = getClickHouseClient();

    // Create database if it doesn't exist
    const database = process.env.CLICKHOUSE_DATABASE || 'apexmediation';
    console.log(`📊 Creating database: ${database}`);
    
    await client.command({
      query: `CREATE DATABASE IF NOT EXISTS ${database}`,
    });

    console.log(`✅ Database ${database} ready\n`);

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
    await closeClickHouse();
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
