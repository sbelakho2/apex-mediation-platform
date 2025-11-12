/**
 * Integration tests for migration routes
 * Mocks dependencies to avoid database connections
 */

import request from 'supertest';
import express from 'express';
import migrationRoutes from '../migration.routes';

// Mock dependencies
jest.mock('../../middleware/auth', () => ({
  authenticate: jest.fn((req, res, next) => {
    req.user = {
      userId: 'user-123',
      publisherId: 'pub-123',
      email: 'test@example.com',
    };
    next();
  }),
  authorize: jest.fn(() => (req: any, res: any, next: any) => next()),
}));

jest.mock('../../utils/postgres', () => ({
  __esModule: true,
  default: {
    query: jest.fn(),
    connect: jest.fn(() => ({
      query: jest.fn(),
      release: jest.fn(),
    })),
  },
}));

const app = express();
app.use(express.json());
app.use('/api/v1/migration', migrationRoutes);

// Error handler
app.use((err: any, req: any, res: any, next: any) => {
  res.status(err.statusCode || 500).json({
    success: false,
    error: err.message,
  });
});

describe('Migration Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/v1/migration/experiments', () => {
    it('should create a new experiment', async () => {
      const pool = require('../../utils/postgres').default;
      
      pool.connect.mockResolvedValueOnce({
        query: jest.fn()
          .mockResolvedValueOnce({ rows: [] }) // BEGIN
          .mockResolvedValueOnce({
            rows: [{
              id: 'exp-123',
              publisher_id: 'pub-123',
              name: 'Test Experiment',
              description: 'Test description',
              status: 'draft',
              mirror_percent: 0,
              objective: 'revenue_comparison',
              seed: 'seed-123',
              guardrails: {},
              created_at: new Date(),
              updated_at: new Date(),
            }],
          }) // INSERT experiment
          .mockResolvedValueOnce({ rows: [] }) // INSERT audit
          .mockResolvedValueOnce({ rows: [] }), // COMMIT
        release: jest.fn(),
      });

      const response = await request(app)
        .post('/api/v1/migration/experiments')
        .send({
          name: 'Test Experiment',
          description: 'Test description',
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toMatchObject({
        id: 'exp-123',
        name: 'Test Experiment',
        status: 'draft',
      });
    });

    it('should reject invalid input', async () => {
      const response = await request(app)
        .post('/api/v1/migration/experiments')
        .send({})
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/v1/migration/experiments', () => {
    it('should list experiments for publisher', async () => {
      const pool = require('../../utils/postgres').default;
      
      pool.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'exp-1',
            publisher_id: 'pub-123',
            name: 'Experiment 1',
            status: 'active',
            guardrails: {},
            created_at: new Date(),
            updated_at: new Date(),
          },
          {
            id: 'exp-2',
            publisher_id: 'pub-123',
            name: 'Experiment 2',
            status: 'draft',
            guardrails: {},
            created_at: new Date(),
            updated_at: new Date(),
          },
        ],
      });

      const response = await request(app)
        .get('/api/v1/migration/experiments')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(2);
    });

    it('should filter by status', async () => {
      const pool = require('../../utils/postgres').default;
      
      pool.query.mockResolvedValueOnce({
        rows: [{
          id: 'exp-1',
          publisher_id: 'pub-123',
          name: 'Active Experiment',
          status: 'active',
          guardrails: {},
          created_at: new Date(),
          updated_at: new Date(),
        }],
      });

      const response = await request(app)
        .get('/api/v1/migration/experiments?status=active')
        .expect(200);

      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].status).toBe('active');
    });
  });

  describe('GET /api/v1/migration/experiments/:id', () => {
    it('should get experiment by ID', async () => {
      const pool = require('../../utils/postgres').default;
      
      pool.query.mockResolvedValueOnce({
        rows: [{
          id: 'exp-123',
          publisher_id: 'pub-123',
          name: 'Test Experiment',
          status: 'draft',
          guardrails: {},
          created_at: new Date(),
          updated_at: new Date(),
        }],
      });

      const response = await request(app)
        .get('/api/v1/migration/experiments/exp-123')
        .expect(200);

      expect(response.body.data.id).toBe('exp-123');
    });

    it('should return 404 for non-existent experiment', async () => {
      const pool = require('../../utils/postgres').default;
      
      pool.query.mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .get('/api/v1/migration/experiments/exp-999')
        .expect(404);

      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/v1/migration/experiments/:id/activate', () => {
    it('should activate experiment with mirror percent', async () => {
      const pool = require('../../utils/postgres').default;
      
      pool.connect.mockResolvedValueOnce({
        query: jest.fn()
          .mockResolvedValueOnce({ rows: [] }) // BEGIN
          .mockResolvedValueOnce({
            rows: [{
              id: 'exp-123',
              publisher_id: 'pub-123',
              status: 'active',
              mirror_percent: 10,
              activated_at: new Date(),
              guardrails: {},
              created_at: new Date(),
              updated_at: new Date(),
            }],
          }) // UPDATE
          .mockResolvedValueOnce({ rows: [] }) // INSERT event
          .mockResolvedValueOnce({ rows: [] }) // INSERT audit
          .mockResolvedValueOnce({ rows: [] }), // COMMIT
        release: jest.fn(),
      });

      const response = await request(app)
        .post('/api/v1/migration/experiments/exp-123/activate')
        .send({ mirror_percent: 10 })
        .expect(200);

      expect(response.body.data.status).toBe('active');
      expect(response.body.data.mirror_percent).toBe(10);
    });
  });

  describe('POST /api/v1/migration/experiments/:id/pause', () => {
    it('should pause active experiment', async () => {
      const pool = require('../../utils/postgres').default;
      
      pool.connect.mockResolvedValueOnce({
        query: jest.fn()
          .mockResolvedValueOnce({ rows: [] }) // BEGIN
          .mockResolvedValueOnce({
            rows: [{
              id: 'exp-123',
              publisher_id: 'pub-123',
              status: 'paused',
              paused_at: new Date(),
              guardrails: {},
              created_at: new Date(),
              updated_at: new Date(),
            }],
          }) // UPDATE
          .mockResolvedValueOnce({ rows: [] }) // INSERT event
          .mockResolvedValueOnce({ rows: [] }), // COMMIT
        release: jest.fn(),
      });

      const response = await request(app)
        .post('/api/v1/migration/experiments/exp-123/pause')
        .send({ reason: 'Manual pause for testing' })
        .expect(200);

      expect(response.body.data.status).toBe('paused');
    });
  });

  describe('POST /api/v1/migration/assign', () => {
    it('should return assignment for active experiment', async () => {
      const pool = require('../../utils/postgres').default;
      
      pool.query
        .mockResolvedValueOnce({
          rows: [{
            id: 'exp-123',
            placement_id: 'placement-456',
            status: 'active',
            seed: 'test-seed',
            mirror_percent: 10,
          }],
        }) // Find active experiment
        .mockResolvedValueOnce({ rows: [] }); // Log assignment

      const response = await request(app)
        .post('/api/v1/migration/assign')
        .send({
          user_identifier: 'user-test-123',
          placement_id: 'placement-456',
        })
        .expect(200);

      expect(response.body.data.has_experiment).toBe(true);
      expect(response.body.data.experiment_id).toBe('exp-123');
      expect(['control', 'test']).toContain(response.body.data.arm);
    });

    it('should return control when no active experiment', async () => {
      const pool = require('../../utils/postgres').default;
      
      pool.query.mockResolvedValueOnce({ rows: [] }); // No active experiment

      const response = await request(app)
        .post('/api/v1/migration/assign')
        .send({
          user_identifier: 'user-test-123',
          placement_id: 'placement-456',
        })
        .expect(200);

      expect(response.body.data.has_experiment).toBe(false);
      expect(response.body.data.arm).toBe('control');
    });

    it('should require user_identifier and placement_id', async () => {
      const response = await request(app)
        .post('/api/v1/migration/assign')
        .send({})
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('required');
    });
  });
});
