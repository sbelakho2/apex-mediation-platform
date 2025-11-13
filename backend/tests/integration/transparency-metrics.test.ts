import request from 'supertest';
import express, { Application } from 'express';
import { createClient, ClickHouseClient } from '@clickhouse/client';

const resolveClickHouseUrl = (): string => {
  if (process.env.CLICKHOUSE_URL) {
    return process.env.CLICKHOUSE_URL;
  }

  const host = process.env.CLICKHOUSE_HOST?.trim();
  const port = process.env.CLICKHOUSE_PORT || '8123';

  if (!host) {
    return `http://localhost:${port}`;
  }

  let normalized = host.replace(/\/$/, '');
  if (!normalized.startsWith('http://') && !normalized.startsWith('https://')) {
    normalized = `http://${normalized}`;
  }
  const afterScheme = normalized.split('://')[1] ?? normalized;
  if (!/:[0-9]+$/.test(afterScheme)) {
    normalized = `${normalized}:${port}`;
  }
  return normalized;
};

/**
 * Integration tests for transparency metrics API
 * Tests metric collection, aggregation, and retrieval
 */

describe('Transparency Metrics Integration', () => {
  let app: Application;
  let clickhouse: ClickHouseClient;
  const METRICS_TABLE = 'transparency_metrics';

  beforeAll(async () => {
    // Set up test ClickHouse client
    clickhouse = createClient({
      url: resolveClickHouseUrl(),
      database: process.env.CLICKHOUSE_DATABASE || 'apexmediation',
    });

    // Create test table
    await clickhouse.command({
      query: `
        CREATE TABLE IF NOT EXISTS ${METRICS_TABLE} (
          timestamp DateTime64(3),
          metric_type String,
          publisher_id String,
          ad_network String,
          value Float64,
          metadata String
        ) ENGINE = MergeTree()
        ORDER BY (timestamp, publisher_id, metric_type)
      `,
    });

    // Set up Express app with transparency endpoint
    app = express();
    app.use(express.json());

    app.post('/api/v1/transparency/metrics', async (req, res) => {
      try {
        const metrics = Array.isArray(req.body) ? req.body : [req.body];
        
        await clickhouse.insert({
          table: METRICS_TABLE,
          values: metrics.map(m => ({
            timestamp: new Date(m.timestamp || Date.now()).toISOString(),
            metric_type: m.metric_type,
            publisher_id: m.publisher_id,
            ad_network: m.ad_network || 'unknown',
            value: m.value,
            metadata: JSON.stringify(m.metadata || {}),
          })),
          format: 'JSONEachRow',
        });

        res.status(201).json({ success: true, count: metrics.length });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    app.get('/api/v1/transparency/metrics', async (req, res) => {
      try {
        const { publisher_id, metric_type, from, to } = req.query;
        
        let query = `SELECT * FROM ${METRICS_TABLE} WHERE 1=1`;
        if (publisher_id) query += ` AND publisher_id = '${publisher_id}'`;
        if (metric_type) query += ` AND metric_type = '${metric_type}'`;
        if (from) query += ` AND timestamp >= '${from}'`;
        if (to) query += ` AND timestamp <= '${to}'`;
        query += ' ORDER BY timestamp DESC LIMIT 1000';

        const result = await clickhouse.query({
          query,
          format: 'JSONEachRow',
        });

        const rows = await result.json<any>();
        res.status(200).json({ metrics: rows });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    app.get('/api/v1/transparency/metrics/aggregate', async (req, res) => {
      try {
        const { publisher_id, metric_type, interval = 'day' } = req.query;
        
        const intervalFunc = interval === 'hour' ? 'toStartOfHour' : 'toStartOfDay';
        
        let query = `
          SELECT 
            ${intervalFunc}(timestamp) as period,
            metric_type,
            ad_network,
            COUNT(*) as count,
            AVG(value) as avg_value,
            SUM(value) as total_value
          FROM ${METRICS_TABLE}
          WHERE publisher_id = '${publisher_id}'
        `;
        
        if (metric_type) query += ` AND metric_type = '${metric_type}'`;
        query += ` GROUP BY period, metric_type, ad_network ORDER BY period DESC`;

        const result = await clickhouse.query({
          query,
          format: 'JSONEachRow',
        });

        const rows = await result.json<any>();
        res.status(200).json({ aggregates: rows });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });
  });

  afterAll(async () => {
    await clickhouse.command({ query: `DROP TABLE IF EXISTS ${METRICS_TABLE}` });
    await clickhouse.close();
  });

  beforeEach(async () => {
    await clickhouse.command({ query: `TRUNCATE TABLE ${METRICS_TABLE}` });
  });

  test('should ingest single transparency metric', async () => {
    const metric = {
      metric_type: 'bid_response_time',
      publisher_id: 'pub_123',
      ad_network: 'admob',
      value: 45.5,
      metadata: { request_id: 'req_456' },
    };

    const response = await request(app)
      .post('/api/v1/transparency/metrics')
      .send(metric);

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.count).toBe(1);
  });

  test('should ingest batch of transparency metrics', async () => {
    const metrics = Array.from({ length: 50 }, (_, i) => ({
      metric_type: 'fill_rate',
      publisher_id: 'pub_123',
      ad_network: ['admob', 'unity', 'applovin'][i % 3],
      value: Math.random(),
      metadata: {},
    }));

    const response = await request(app)
      .post('/api/v1/transparency/metrics')
      .send(metrics);

    expect(response.status).toBe(201);
    expect(response.body.count).toBe(50);
  });

  test('should retrieve metrics with filters', async () => {
    // Insert test data
    const metrics = [
      {
        metric_type: 'revenue',
        publisher_id: 'pub_123',
        ad_network: 'admob',
        value: 10.50,
        metadata: {},
      },
      {
        metric_type: 'impressions',
        publisher_id: 'pub_123',
        ad_network: 'unity',
        value: 1000,
        metadata: {},
      },
      {
        metric_type: 'revenue',
        publisher_id: 'pub_456',
        ad_network: 'admob',
        value: 5.25,
        metadata: {},
      },
    ];

    await request(app)
      .post('/api/v1/transparency/metrics')
      .send(metrics);

    // Query with publisher filter
    const response = await request(app)
      .get('/api/v1/transparency/metrics')
      .query({ publisher_id: 'pub_123' });

    expect(response.status).toBe(200);
    expect(response.body.metrics).toHaveLength(2);
    expect(response.body.metrics.every((m: any) => m.publisher_id === 'pub_123')).toBe(true);
  });

  test('should aggregate metrics by time period', async () => {
    const now = new Date();
    const metrics = Array.from({ length: 10 }, (_, i) => ({
      timestamp: new Date(now.getTime() - i * 3600000).toISOString(), // Hourly
      metric_type: 'clicks',
      publisher_id: 'pub_123',
      ad_network: 'admob',
      value: Math.floor(Math.random() * 100),
      metadata: {},
    }));

    await request(app)
      .post('/api/v1/transparency/metrics')
      .send(metrics);

    const response = await request(app)
      .get('/api/v1/transparency/metrics/aggregate')
      .query({ publisher_id: 'pub_123', interval: 'hour' });

    expect(response.status).toBe(200);
    expect(response.body.aggregates.length).toBeGreaterThan(0);
    expect(response.body.aggregates[0]).toHaveProperty('period');
    expect(response.body.aggregates[0]).toHaveProperty('avg_value');
    expect(response.body.aggregates[0]).toHaveProperty('total_value');
  });

  test('should handle invalid metrics gracefully', async () => {
    const invalidMetric = {
      // Missing required fields
      publisher_id: 'pub_123',
    };

    const response = await request(app)
      .post('/api/v1/transparency/metrics')
      .send(invalidMetric);

    expect(response.status).toBe(500);
    expect(response.body.error).toBeDefined();
  });

  test('should calculate network performance comparisons', async () => {
    const networks = ['admob', 'unity', 'applovin'];
    const metrics = networks.flatMap(network =>
      Array.from({ length: 10 }, (_, i) => ({
        metric_type: 'cpm',
        publisher_id: 'pub_123',
        ad_network: network,
        value: Math.random() * 10,
        metadata: {},
      }))
    );

    await request(app)
      .post('/api/v1/transparency/metrics')
      .send(metrics);

    const response = await request(app)
      .get('/api/v1/transparency/metrics/aggregate')
      .query({ publisher_id: 'pub_123', metric_type: 'cpm' });

    expect(response.status).toBe(200);
    
    const aggregates = response.body.aggregates;
    const networkData = aggregates.reduce((acc: any, row: any) => {
      if (!acc[row.ad_network]) {
        acc[row.ad_network] = { count: 0, total: 0 };
      }
      acc[row.ad_network].count += Number(row.count);
      acc[row.ad_network].total += Number(row.total_value);
      return acc;
    }, {});

    expect(Object.keys(networkData)).toContain('admob');
    expect(Object.keys(networkData)).toContain('unity');
    expect(Object.keys(networkData)).toContain('applovin');
  });
});
