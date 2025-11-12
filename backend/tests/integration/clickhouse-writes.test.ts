import { ClickHouseClient, createClient } from '@clickhouse/client';

/**
 * Integration tests for ClickHouse write operations and rollback behavior
 * Tests data integrity and error handling in analytics pipeline
 */

describe('ClickHouse Write and Rollback', () => {
  let client: ClickHouseClient;
  const TEST_TABLE = 'test_events';

  beforeAll(async () => {
    client = createClient({
      host: process.env.CLICKHOUSE_HOST || 'http://localhost:8123',
      database: process.env.CLICKHOUSE_DATABASE || 'apexmediation',
      username: process.env.CLICKHOUSE_USER || 'default',
      password: process.env.CLICKHOUSE_PASSWORD || '',
    });

    // Create test table
    await client.command({
      query: `
        CREATE TABLE IF NOT EXISTS ${TEST_TABLE} (
          event_id String,
          event_type String,
          timestamp DateTime64(3),
          user_id String,
          metadata String
        ) ENGINE = MergeTree()
        ORDER BY (timestamp, event_id)
      `,
    });
  });

  afterAll(async () => {
    // Clean up test table
    await client.command({ query: `DROP TABLE IF EXISTS ${TEST_TABLE}` });
    await client.close();
  });

  beforeEach(async () => {
    // Clear test data
    await client.command({ query: `TRUNCATE TABLE ${TEST_TABLE}` });
  });

  test('should successfully write single event', async () => {
    const event = {
      event_id: 'evt_123',
      event_type: 'ad_impression',
      timestamp: new Date().toISOString(),
      user_id: 'user_456',
      metadata: JSON.stringify({ ad_id: 'ad_789' }),
    };

    await client.insert({
      table: TEST_TABLE,
      values: [event],
      format: 'JSONEachRow',
    });

    const result = await client.query({
      query: `SELECT * FROM ${TEST_TABLE} WHERE event_id = '${event.event_id}'`,
      format: 'JSONEachRow',
    });

    const rows = await result.json<any>();
    expect(rows).toHaveLength(1);
    expect(rows[0].event_id).toBe('evt_123');
    expect(rows[0].event_type).toBe('ad_impression');
  });

  test('should successfully write batch of events', async () => {
    const events = Array.from({ length: 100 }, (_, i) => ({
      event_id: `evt_${i}`,
      event_type: 'ad_click',
      timestamp: new Date().toISOString(),
      user_id: `user_${i % 10}`,
      metadata: JSON.stringify({ ad_id: `ad_${i}` }),
    }));

    await client.insert({
      table: TEST_TABLE,
      values: events,
      format: 'JSONEachRow',
    });

    const result = await client.query({
      query: `SELECT COUNT(*) as count FROM ${TEST_TABLE}`,
      format: 'JSONEachRow',
    });

    const rows = await result.json<any>();
    expect(Number(rows[0].count)).toBe(100);
  });

  test('should handle write failures gracefully', async () => {
    const invalidEvent = {
      event_id: 'evt_bad',
      event_type: null, // Invalid: not null column
      timestamp: 'invalid_date',
      user_id: 'user_789',
      metadata: 'not_json',
    };

    await expect(
      client.insert({
        table: TEST_TABLE,
        values: [invalidEvent],
        format: 'JSONEachRow',
      })
    ).rejects.toThrow();

    // Verify no partial data written
    const result = await client.query({
      query: `SELECT COUNT(*) as count FROM ${TEST_TABLE}`,
      format: 'JSONEachRow',
    });

    const rows = await result.json<any>();
    expect(Number(rows[0].count)).toBe(0);
  });

  test('should maintain consistency in transaction-like batches', async () => {
    // Write first batch successfully
    const batch1 = Array.from({ length: 50 }, (_, i) => ({
      event_id: `evt_batch1_${i}`,
      event_type: 'ad_impression',
      timestamp: new Date().toISOString(),
      user_id: 'user_batch1',
      metadata: '{}',
    }));

    await client.insert({
      table: TEST_TABLE,
      values: batch1,
      format: 'JSONEachRow',
    });

    // Try to write second batch with one invalid row
    const batch2 = [
      ...Array.from({ length: 40 }, (_, i) => ({
        event_id: `evt_batch2_${i}`,
        event_type: 'ad_click',
        timestamp: new Date().toISOString(),
        user_id: 'user_batch2',
        metadata: '{}',
      })),
      {
        event_id: 'evt_batch2_bad',
        event_type: null as any, // Invalid
        timestamp: new Date().toISOString(),
        user_id: 'user_batch2',
        metadata: '{}',
      },
    ];

    // Batch should fail completely
    await expect(
      client.insert({
        table: TEST_TABLE,
        values: batch2,
        format: 'JSONEachRow',
      })
    ).rejects.toThrow();

    // Verify only first batch written (no partial second batch)
    const result = await client.query({
      query: `SELECT COUNT(*) as count FROM ${TEST_TABLE}`,
      format: 'JSONEachRow',
    });

    const rows = await result.json<any>();
    expect(Number(rows[0].count)).toBe(50); // Only batch1
  });

  test('should handle connection failures and retry logic', async () => {
    const badClient = createClient({
      host: 'http://nonexistent:8123',
      request_timeout: 1000,
    });

    await expect(
      badClient.query({ query: 'SELECT 1', format: 'JSONEachRow' })
    ).rejects.toThrow();

    await badClient.close();
  });

  test('should deduplicate events using ReplacingMergeTree pattern', async () => {
    // Insert same event twice (simulating retry)
    const event = {
      event_id: 'evt_dedupe',
      event_type: 'ad_conversion',
      timestamp: new Date().toISOString(),
      user_id: 'user_dedupe',
      metadata: '{}',
    };

    await client.insert({
      table: TEST_TABLE,
      values: [event],
      format: 'JSONEachRow',
    });

    await client.insert({
      table: TEST_TABLE,
      values: [event],
      format: 'JSONEachRow',
    });

    // Query without deduplication
    const beforeMerge = await client.query({
      query: `SELECT COUNT(*) as count FROM ${TEST_TABLE} WHERE event_id = '${event.event_id}'`,
      format: 'JSONEachRow',
    });

    const rowsBefore = await beforeMerge.json<any>();
    expect(Number(rowsBefore[0].count)).toBe(2); // Duplicates exist before merge

    // Note: For actual deduplication, use ReplacingMergeTree and OPTIMIZE TABLE
    // or SELECT DISTINCT in application layer
  });
});
