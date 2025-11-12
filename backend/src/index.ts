import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { logger } from './utils/logger';
import { errorHandler } from './middleware/errorHandler';
import { requestContextMiddleware } from './middleware/requestContext';
import apiRoutes from './routes';
import { initializeDatabase } from './utils/postgres';
import { initializeClickHouse, checkClickHouseHealth } from './utils/clickhouse';
import { redis } from './utils/redis';
import { initializeQueues, shutdownQueues, queueManager } from './queues/queueInitializer';
import { promRegister, httpRequestDurationSeconds, httpRequestsTotal } from './utils/prometheus';
import { authRateLimiter } from './middleware/redisRateLimiter';
import swaggerUi from 'swagger-ui-express';
import { getOpenAPIDocument } from './utils/openapi';
import csrfProtection from './middleware/csrf';

// Validate environment variables (fails fast with helpful errors)
import { env } from './config/env';

const app: Application = express();
const PORT = env.PORT;
const API_VERSION = env.API_VERSION;

// Configure trust proxy if behind reverse proxy (load balancer, nginx, etc.)
if (env.TRUST_PROXY) {
  app.set('trust proxy', 1);
  logger.info('Trust proxy enabled - respecting X-Forwarded-* headers');
}

// Security middleware
app.use(helmet({
  crossOriginOpenerPolicy: { policy: 'same-origin' },
  contentSecurityPolicy: process.env.ENABLE_CSP === '1' ? undefined : false,
}));

// Strict CORS allowlist
const allowlist = (process.env.CORS_ALLOWLIST || process.env.CORS_ORIGIN || 'http://localhost:3000')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true); // allow non-browser clients
    if (allowlist.includes(origin)) return callback(null, true);
    return callback(new Error('CORS: origin not allowed'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'),
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'),
  message: 'Too many requests from this IP, please try again later.',
});
app.use(`/api/${API_VERSION}/`, limiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(compression());
app.use(cookieParser());

// Request context middleware (must be early to capture all logs)
app.use(requestContextMiddleware);

// CSRF protection (double-submit cookie). Safe methods are ignored by csurf.
// Must be after cookie parser and before routes.
app.use(csrfProtection);

// RED metrics (Rate, Errors, Duration) by route
app.use((req: Request, res: Response, next: NextFunction) => {
  const end = httpRequestDurationSeconds.startTimer();
  res.on('finish', () => {
    try {
      const labels = {
        method: req.method,
        route: req.route?.path || req.path,
        status_code: String(res.statusCode)
      };
      
      // Record duration histogram (for p50, p95, p99)
      end(labels);
      
      // Record request counter (for rate)
      httpRequestsTotal.inc(labels);
    } catch {
      // noop
    }
  });
  next();
});

// Health check endpoint
app.get('/health', async (req: Request, res: Response) => {
  const postgresHealthy = true; // Already checked during startup
  const clickhouseHealthy = await checkClickHouseHealth();
  const redisHealthy = redis.isReady();
  const queuesHealthy = queueManager.isReady();
  
  res.json({
    status: postgresHealthy && clickhouseHealthy ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV,
    services: {
      postgres: postgresHealthy ? 'up' : 'down',
      clickhouse: clickhouseHealthy ? 'up' : 'down',
      redis: redisHealthy ? 'up' : 'down',
      queues: queuesHealthy ? 'up' : 'down',
    },
  });
});

app.get('/metrics', async (_req: Request, res: Response) => {
  try {
    res.set('Content-Type', promRegister.contentType);
    res.send(await promRegister.metrics());
  } catch (error) {
    logger.error('Failed to generate Prometheus metrics', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    res.status(500).send('Unable to collect metrics');
  }
});

// API routes
// Attach stricter rate limiting for auth endpoints
app.use(`/api/${API_VERSION}/auth`, authRateLimiter);

// OpenAPI/Swagger endpoints
app.get('/openapi.json', (_req, res) => {
  res.json(getOpenAPIDocument());
});
app.use('/docs', swaggerUi.serve, swaggerUi.setup(undefined, { swaggerUrl: '/openapi.json' }));

app.use(`/api/${API_VERSION}`, apiRoutes);

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: 'Route not found',
    path: req.path,
  });
});

// Error handling middleware
app.use(errorHandler);

const startServer = async (): Promise<void> => {
  try {
    // Initialize PostgreSQL
    await initializeDatabase();

    // Initialize ClickHouse (non-blocking - log warning if fails)
    try {
      await initializeClickHouse();
    } catch (error) {
      logger.warn('ClickHouse initialization failed - analytics features may be unavailable', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }

    // Initialize Redis (non-blocking - log warning if fails)
    try {
      await redis.connect();
      logger.info('Redis cache enabled');
    } catch (error) {
      logger.warn('Redis connection failed - caching disabled', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }

    // Initialize job queues (requires Redis)
    if (redis.isReady()) {
      try {
        await initializeQueues();
        logger.info('Job queues enabled');
      } catch (error) {
        logger.warn('Job queue initialization failed - background jobs disabled', {
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    } else {
      logger.warn('Redis not available - background jobs disabled');
    }

    app.listen(PORT, () => {
      logger.info(`ApexMediation Backend API running on port ${PORT}`);
      logger.info(`Environment: ${process.env.NODE_ENV}`);
      logger.info(`API Version: ${API_VERSION}`);
    });
  } catch (error) {
    logger.error('Failed to start server', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });
    process.exit(1);
  }
};

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully...');
  
  try {
    await shutdownQueues();
    await redis.disconnect();
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown', { error });
    process.exit(1);
  }
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully...');
  
  try {
    await shutdownQueues();
    await redis.disconnect();
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown', { error });
    process.exit(1);
  }
});

void startServer();

export default app;
