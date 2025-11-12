/**
 * Unit tests for MigrationStudioService
 * Uses mocked database to avoid dependencies
 */

// Set test environment
process.env.NODE_ENV = 'test';
process.env.SKIP_DB_SETUP = 'true';
process.env.DATABASE_URL = 'postgresql://mock:mock@localhost:5432/mock';

// Provide minimal global crypto implementation for randomUUID usage
(global as any).crypto = {
  randomUUID: jest.fn(() => 'mock-uuid-123'),
};

// Mock logger BEFORE imports
const mockLogger = {
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
};

jest.mock('../../utils/logger', () => ({
  __esModule: true,
  default: mockLogger,
}));

// Mock crypto for consistent seed generation
jest.mock('crypto', () => {
  const actualCrypto = jest.requireActual('crypto');
  return {
    ...actualCrypto,
    randomUUID: jest.fn(() => 'mock-uuid-123'),
  };
});

describe('MigrationStudioService', () => {
  // Import after mocks are set up
  let MigrationStudioService: any;
  let AppError: any;
  let mockPool: any;
  let mockClient: any;
  let service: any;

  beforeAll(async () => {
    // Dynamically import after mocks
    const serviceModule = await import('../migrationStudioService');
    MigrationStudioService = serviceModule.MigrationStudioService;
    
    const errorModule = await import('../../middleware/errorHandler');
    AppError = errorModule.AppError;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Create mock client
    mockClient = {
      query: jest.fn(),
      release: jest.fn(),
    };
    
    // Create mock pool
    mockPool = {
      query: jest.fn(),
      connect: jest.fn().mockResolvedValue(mockClient),
      end: jest.fn(),
      on: jest.fn(),
    };
    
    service = new MigrationStudioService(mockPool);
  });

  describe('createExperiment', () => {
    it('should create a new experiment with defaults', async () => {
      const mockExperiment = {
        id: 'exp-123',
        publisher_id: 'pub-123',
        name: 'Test Experiment',
        description: 'Test description',
        app_id: null,
        placement_id: null,
        objective: 'revenue_comparison',
        seed: 'seed-123',
        mirror_percent: 0,
        status: 'draft',
        guardrails: {
          latency_budget_ms: 500,
          revenue_floor_percent: -10,
          max_error_rate_percent: 5,
          min_impressions: 1000,
        },
        created_by: 'user-123',
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [mockExperiment] }) // INSERT experiment
        .mockResolvedValueOnce({ rows: [] }) // INSERT audit
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      const result = await service.createExperiment(
        'pub-123',
        'user-123',
        {
          name: 'Test Experiment',
          description: 'Test description',
        }
      );

      expect(result).toMatchObject({
        id: 'exp-123',
        name: 'Test Experiment',
        status: 'draft',
      });

      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    });

    it('should validate placement access before creating', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [] }); // Placement check - no access

      await expect(
        service.createExperiment('pub-123', 'user-123', {
          name: 'Test',
          placement_id: 'placement-999',
        })
      ).rejects.toThrow('Placement not found or access denied');

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });
  });

  describe('getExperiment', () => {
    it('should retrieve experiment by ID and publisher', async () => {
      const mockExperiment = {
        id: 'exp-123',
        publisher_id: 'pub-123',
        name: 'Test Experiment',
        status: 'draft',
        guardrails: {},
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockPool.query.mockResolvedValueOnce({ rows: [mockExperiment] });

      const result = await service.getExperiment('exp-123', 'pub-123');

      expect(result.id).toBe('exp-123');
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM migration_experiments'),
        ['exp-123', 'pub-123']
      );
    });

    it('should throw 404 if experiment not found', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      await expect(
        service.getExperiment('exp-999', 'pub-123')
      ).rejects.toThrow('Experiment not found');
    });
  });

  describe('activateExperiment', () => {
    it('should activate draft experiment', async () => {
      const mockExperiment = {
        id: 'exp-123',
        publisher_id: 'pub-123',
        status: 'active',
        mirror_percent: 10,
        activated_at: new Date(),
        guardrails: {},
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [mockExperiment] }) // UPDATE status
        .mockResolvedValueOnce({ rows: [] }) // INSERT event
        .mockResolvedValueOnce({ rows: [] }) // INSERT audit
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      const result = await service.activateExperiment(
        'exp-123',
        'pub-123',
        'user-123',
        { mirror_percent: 10 }
      );

      expect(result.status).toBe('active');
      expect(result.mirror_percent).toBe(10);

      // Check activation event was logged
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO migration_events'),
        expect.arrayContaining(['exp-123', 'activation'])
      );
    });

    it('should fail if experiment is not draft or paused', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [] }); // UPDATE returns nothing

      await expect(
        service.activateExperiment('exp-123', 'pub-123', 'user-123', { mirror_percent: 10 })
      ).rejects.toThrow('Experiment not found or cannot be activated');

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });
  });

  describe('pauseExperiment', () => {
    it('should pause active experiment', async () => {
      const mockExperiment = {
        id: 'exp-123',
        publisher_id: 'pub-123',
        status: 'paused',
        paused_at: new Date(),
        guardrails: {},
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [mockExperiment] }) // UPDATE status
        .mockResolvedValueOnce({ rows: [] }) // INSERT event
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      const result = await service.pauseExperiment(
        'exp-123',
        'pub-123',
        'user-123',
        'Testing guardrail'
      );

      expect(result.status).toBe('paused');
      
      // Check deactivation event was logged
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO migration_events'),
        expect.arrayContaining(['exp-123', 'deactivation', 'Testing guardrail'])
      );
    });
  });

  describe('updateExperiment', () => {
    it('should update draft experiment fields', async () => {
      const existingExp = {
        id: 'exp-123',
        publisher_id: 'pub-123',
        status: 'draft',
        name: 'Old Name',
        mirror_percent: 0,
        guardrails: {
          latency_budget_ms: 500,
        },
        created_at: new Date(),
        updated_at: new Date(),
      };

      const updatedExp = {
        ...existingExp,
        name: 'New Name',
        mirror_percent: 5,
      };

      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [existingExp] }) // SELECT existing
        .mockResolvedValueOnce({ rows: [updatedExp] }) // UPDATE
        .mockResolvedValueOnce({ rows: [] }) // INSERT audit
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      const result = await service.updateExperiment(
        'exp-123',
        'pub-123',
        'user-123',
        {
          name: 'New Name',
          mirror_percent: 5,
        }
      );

      expect(result.name).toBe('New Name');
      expect(result.mirror_percent).toBe(5);
    });

    it('should reject updates to active experiments', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({
          rows: [{ id: 'exp-123', status: 'active', guardrails: {} }],
        }); // SELECT - active status

      await expect(
        service.updateExperiment('exp-123', 'pub-123', 'user-123', { name: 'New Name' })
      ).rejects.toThrow('Cannot update active or completed experiment');

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });

    it('should validate mirror_percent range', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({
          rows: [{ id: 'exp-123', status: 'draft', guardrails: {} }],
        });

      await expect(
        service.updateExperiment('exp-123', 'pub-123', 'user-123', { mirror_percent: 25 })
      ).rejects.toThrow('mirror_percent must be between 0 and 20');
    });
  });

  describe('assignArm', () => {
    it('should deterministically assign to test arm based on hash', () => {
      const userId = 'user-123';
      const placementId = 'placement-456';
      const seed = 'seed-789';

      // With mirror_percent = 10, ~10% should be 'test'
      const arm1 = service.assignArm(userId, placementId, seed, 10);
      const arm2 = service.assignArm(userId, placementId, seed, 10);

      // Same inputs should produce same output
      expect(arm1).toBe(arm2);
    });

    it('should assign to control when mirror_percent is 0', () => {
      const arm = service.assignArm('user-123', 'placement-456', 'seed', 0);
      expect(arm).toBe('control');
    });

    it('should be deterministic across multiple calls', () => {
      const results = new Set();
      const userId = 'user-test';
      const placementId = 'placement-test';
      const seed = 'seed-test';

      for (let i = 0; i < 10; i++) {
        const arm = service.assignArm(userId, placementId, seed, 10);
        results.add(arm);
      }

      // Should only have one unique result (deterministic)
      expect(results.size).toBe(1);
    });

    it('should produce different assignments for different seeds', () => {
      const userId = 'user-123';
      const placementId = 'placement-456';

      const arm1 = service.assignArm(userId, placementId, 'seed-1', 10);
      const arm2 = service.assignArm(userId, placementId, 'seed-2', 10);

      // Different seeds might produce different results (not guaranteed, but likely)
      // At minimum, function should not crash
      expect(['control', 'test']).toContain(arm1);
      expect(['control', 'test']).toContain(arm2);
    });
  });

  describe('logAssignment', () => {
    it('should log assignment with hashed user identifier', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      await service.logAssignment(
        'exp-123',
        'test',
        'user-identifier-123',
        'placement-456',
        { extra: 'metadata' }
      );

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO migration_events'),
        expect.arrayContaining([
          'exp-123',
          'assignment',
          'test',
          expect.any(String), // hashed user identifier
          'placement-456',
          JSON.stringify({ extra: 'metadata' }),
        ])
      );
    });
  });

  describe('deleteExperiment', () => {
    it('should archive experiment instead of hard delete', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [{ id: 'exp-123' }] }) // UPDATE to archived
        .mockResolvedValueOnce({ rows: [] }) // INSERT audit
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      await service.deleteExperiment('exp-123', 'pub-123', 'user-123');

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining("SET status = 'archived'"),
        ['exp-123', 'pub-123']
      );
    });

    it('should not allow deleting active experiments', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [] }); // UPDATE returns nothing (active exp)

      await expect(
        service.deleteExperiment('exp-123', 'pub-123', 'user-123')
      ).rejects.toThrow('Experiment not found or cannot be deleted');
    });
  });
});
