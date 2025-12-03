# Background Job Scheduler Implementation

## Overview

Comprehensive background job processing system using BullMQ for handling asynchronous tasks like data aggregation, report generation, and scheduled maintenance. The system leverages Redis for job queue management and provides full monitoring capabilities.

## Architecture

### Core Components

1. **Queue Manager (`src/queues/queueManager.ts`)**
   - Central management for all job queues
   - Queue creation and configuration
   - Worker registration and lifecycle management
   - Job scheduling and monitoring
   - Health checking and metrics

2. **Job Processors (`src/queues/processors/`)**
   - Analytics Aggregation: Aggregate raw analytics data
   - Data Export: Generate and export analytics reports
   - Report Generation: Create scheduled reports
   - Metrics Calculation: Compute derived metrics
   - Cache Warming: Pre-populate cache for popular queries
   - Cleanup: Maintain system hygiene

3. **Queue Initializer (`src/queues/queueInitializer.ts`)**
   - Initialize all queues on startup
   - Register workers for each queue
   - Schedule recurring jobs
   - Graceful shutdown handling

4. **API Endpoints (`src/routes/queues.routes.ts`)**
   - Monitor queue metrics
   - Add/remove jobs
   - Pause/resume queues
   - Clean old jobs
   
## Queue naming rules

Important: Do not use colon (:) characters in BullMQ queue names. Some Redis deployments and client tooling treat colons as namespace delimiters which can cause errors like "Queue name cannot contain :" in certain environments.

- Use hyphen (-) or underscore (_) instead. Examples: `analytics-aggregation`, `analytics_ingest`.
- Current code uses names with colons for development parity (e.g., `analytics:ingest`). For sandbox, this is acceptable because queues are transient. For production, plan a short maintenance window to drain and recreate queues with colon-free names. See Migration Notes below.

Migration Notes (when normalizing names):
- Drain existing queues (`queue.pause` + wait for workers to finish) and stop workers.
- Recreate queues with new names and deploy workers with matching names.
- Keep both old and new workers briefly if zero-downtime is required; remove old after drain completes.
- Update dashboards/alerts to point at the new queue names.

## Queue Types

### 1. Analytics Aggregation Queue
**Purpose:** Aggregate raw analytics data into summarized tables

**Jobs:**
- Daily aggregation (scheduled at 1 AM)
- On-demand aggregation for specific date ranges
- Aggregates impressions, clicks, revenue
- Calculates derived metrics (CTR, fill rate, eCPM)

**Configuration:**
```typescript
{
  concurrency: 3,
  limiter: {
    max: 10,      // Max 10 jobs
    duration: 60000 // per minute
  }
}
```

**Job Data:**
```typescript
{
  publisherId: string;
  startDate: string;
  endDate: string;
  granularity: 'hour' | 'day' | 'week' | 'month';
}
```

### 2. Data Export Queue
**Purpose:** Generate data exports in CSV/JSON format

**Jobs:**
- On-demand data exports
- Scheduled monthly/weekly reports
- Custom filtered exports

**Configuration:**
```typescript
{
  concurrency: 2,
  limiter: {
    max: 20,
    duration: 60000
  }
}
```

**Job Data:**
```typescript
{
  jobId: string;
  publisherId: string;
  format: 'csv' | 'json';
  startDate: string;
  endDate: string;
  filters?: Record<string, any>;
}
```

### 3. Report Generation Queue
**Purpose:** Generate and email scheduled reports

**Jobs:**
- Weekly reports (Mondays at 8 AM)
- Monthly reports
- Custom ad-hoc reports

**Configuration:**
```typescript
{
  concurrency: 2
}
```

**Job Data:**
```typescript
{
  publisherId: string;
  reportType: 'daily' | 'weekly' | 'monthly';
  date: string;
  recipients?: string[];
}
```

### 4. Metrics Calculation Queue
**Purpose:** Calculate performance metrics

**Jobs:**
- Hourly metrics calculation
- Real-time metric updates
- Historical metric recalculation

**Configuration:**
```typescript
{
  concurrency: 5
}
```

**Job Data:**
```typescript
{
  publisherId: string;
  metricType: 'performance' | 'revenue' | 'quality';
  period: string;
}
```

### 5. Cache Warming Queue
**Purpose:** Pre-populate cache for popular queries

**Jobs:**
- Warm popular dashboard queries (every 5 minutes)
- Pre-cache for high-traffic endpoints
- Scheduled cache refresh

**Configuration:**
```typescript
{
  concurrency: 3
}
```

**Job Data:**
```typescript
{
  cacheKeys: string[];
  priority?: number;
}
```

### 6. Cleanup Queue
**Purpose:** Maintain system hygiene

**Jobs:**
- Delete old logs (daily at 2 AM)
- Expire old tokens
- Clean temporary files

**Configuration:**
```typescript
{
  concurrency: 1 // Sequential processing
}
```

**Job Data:**
```typescript
{
  type: 'old_logs' | 'expired_tokens' | 'temp_files';
  olderThan?: string;
}
```

## Scheduled Jobs

### Daily Jobs

| Job | Schedule | Queue | Purpose |
|-----|----------|-------|---------|
| Daily Aggregation | 1:00 AM | analytics:aggregation | Aggregate previous day's data |
| Daily Cleanup | 2:00 AM | cleanup | Remove old logs and temp files |

### Hourly Jobs

| Job | Schedule | Queue | Purpose |
|-----|----------|-------|---------|
| Hourly Metrics | Every hour | metrics:calculation | Calculate hourly performance metrics |

### Regular Intervals

| Job | Schedule | Queue | Purpose |
|-----|----------|-------|---------|
| Cache Warming | Every 5 min | cache:warming | Pre-populate popular caches |

### Weekly Jobs

| Job | Schedule | Queue | Purpose |
|-----|----------|-------|---------|
| Weekly Reports | Mon 8:00 AM | report:generation | Generate weekly summary reports |

## API Endpoints

### Get All Queue Metrics
```http
GET /api/v1/queues/metrics
Authorization: Bearer <token>

Response:
{
  "success": true,
  "data": {
    "analytics:aggregation": {
      "waiting": 5,
      "active": 2,
      "completed": 1234,
      "failed": 3,
      "delayed": 0
    },
    "data:export": { ... },
    ...
  }
}
```

### Get Specific Queue Metrics
```http
GET /api/v1/queues/:queueName/metrics
Authorization: Bearer <token>

Response:
{
  "success": true,
  "data": {
    "waiting": 5,
    "active": 2,
    "completed": 1234,
    "failed": 3,
    "delayed": 0
  }
}
```

### Add Job to Queue
```http
POST /api/v1/queues/:queueName/jobs
Authorization: Bearer <token>
Content-Type: application/json

{
  "jobName": "custom-aggregation",
  "data": {
    "publisherId": "pub-123",
    "startDate": "2024-01-01",
    "endDate": "2024-01-31",
    "granularity": "day"
  },
  "options": {
    "priority": 10,
    "delay": 5000
  }
}

Response:
{
  "success": true,
  "data": {
    "jobId": "job-456",
    "queueName": "analytics:aggregation",
    "jobName": "custom-aggregation"
  }
}
```

### Get Job Status
```http
GET /api/v1/queues/:queueName/jobs/:jobId
Authorization: Bearer <token>

Response:
{
  "success": true,
  "data": {
    "id": "job-456",
    "name": "custom-aggregation",
    "data": { ... },
    "progress": 75,
    "attemptsMade": 1,
    "processedOn": 1234567890,
    "finishedOn": null
  }
}
```

### Remove Job
```http
DELETE /api/v1/queues/:queueName/jobs/:jobId
Authorization: Bearer <token>

Response:
{
  "success": true,
  "message": "Job removed successfully"
}
```

### Pause Queue
```http
POST /api/v1/queues/:queueName/pause
Authorization: Bearer <token>

Response:
{
  "success": true,
  "message": "Queue paused successfully"
}
```

### Resume Queue
```http
POST /api/v1/queues/:queueName/resume
Authorization: Bearer <token>

Response:
{
  "success": true,
  "message": "Queue resumed successfully"
}
```

### Clean Queue
```http
POST /api/v1/queues/:queueName/clean
Authorization: Bearer <token>
Content-Type: application/json

{
  "gracePeriod": 3600  // seconds
}

Response:
{
  "success": true,
  "message": "Queue cleaned successfully"
}
```

## Configuration

### Environment Variables

```bash
# Redis Configuration (required for queues)
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# Export Directory
EXPORT_DIR=/path/to/exports

# Queue Settings
QUEUE_MAX_ATTEMPTS=3
QUEUE_BACKOFF_DELAY=2000  # milliseconds
```

### Queue Configuration

```typescript
const queueConfig = {
  connection: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
  },
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
    removeOnComplete: {
      age: 24 * 3600,  // Keep 24 hours
      count: 1000,     // Keep max 1000
    },
    removeOnFail: {
      age: 7 * 24 * 3600,  // Keep 7 days
    },
  },
};
```

## Usage Examples

### Programmatic Job Creation

#### Analytics Aggregation
```typescript
import { queueManager, QueueName } from './queues/queueManager';

// Add aggregation job
await queueManager.addJob(
  QueueName.ANALYTICS_AGGREGATION,
  'monthly-aggregation',
  {
    publisherId: 'pub-123',
    startDate: '2024-01-01',
    endDate: '2024-01-31',
    granularity: 'day',
  }
);
```

#### Data Export
```typescript
// Add export job
await queueManager.addJob(
  QueueName.DATA_EXPORT,
  'monthly-export',
  {
    jobId: 'export-789',
    publisherId: 'pub-123',
    format: 'csv',
    startDate: '2024-01-01',
    endDate: '2024-01-31',
  }
);
```

#### Delayed Job
```typescript
// Schedule job for later
await queueManager.addJob(
  QueueName.REPORT_GENERATION,
  'weekly-report',
  {
    publisherId: 'pub-123',
    reportType: 'weekly',
    date: '2024-01-15',
  },
  {
    delay: 3600000,  // 1 hour delay
    priority: 5,
  }
);
```

#### Recurring Job
```typescript
// Schedule recurring job
await queueManager.scheduleRecurringJob(
  QueueName.CACHE_WARMING,
  'dashboard-cache',
  {
    cacheKeys: ['dashboard:stats', 'analytics:overview'],
    priority: 10,
  },
  '*/10 * * * *'  // Every 10 minutes
);
```

## Monitoring

### Health Check

```bash
GET /health

Response:
{
  "status": "healthy",
  "services": {
    "postgres": "up",
    "analytics_rollups": "up",
    "redis": "up",
    "queues": "up"
  }
}
```

### Queue Metrics

Monitor queue health:
- **waiting**: Jobs waiting to be processed
- **active**: Jobs currently processing
- **completed**: Successfully completed jobs
- **failed**: Failed jobs (will retry)
- **delayed**: Jobs scheduled for future execution

### Logging

All queue operations are logged:
```typescript
logger.info('Job added to queue', { queue, jobName, jobId });
logger.info('Job completed', { queue, jobId });
logger.error('Job failed', { queue, jobId, reason });
logger.debug('Job progress', { queue, jobId, progress });
```

## Error Handling

### Retry Strategy

Failed jobs automatically retry with exponential backoff:
- Attempt 1: Immediate
- Attempt 2: After 2 seconds
- Attempt 3: After 4 seconds
- After 3 attempts: Job marked as failed

### Failed Job Handling

Failed jobs are:
- Logged with full error details
- Kept for 7 days for debugging
- Accessible via API for manual inspection
- Can be manually retried or removed

## Performance Considerations

### Concurrency Settings

Adjust based on workload:
- **High I/O jobs** (exports, reports): Low concurrency (2-3)
- **CPU-bound jobs** (aggregations): Medium concurrency (3-5)
- **Light jobs** (cache warming): Higher concurrency (5-10)

### Rate Limiting

Prevents overwhelming downstream services:
```typescript
limiter: {
  max: 20,        // Max jobs
  duration: 60000 // per minute
}
```

### Memory Management

- Completed jobs auto-removed after 24 hours
- Failed jobs kept for 7 days
- Max 1000 completed jobs retained
- Regular queue cleaning recommended

## Graceful Shutdown

System handles graceful shutdown:
```typescript
process.on('SIGTERM', async () => {
  await shutdownQueues();  // Finish active jobs
  await redis.disconnect(); // Close connections
  process.exit(0);
});
```

## Integration with Data Export Service

The queue system integrates with the existing data export service:

1. User creates export via API
2. Export job created in database with status 'pending'
3. Job added to `DATA_EXPORT` queue
4. Worker processes job:
   - Updates status to 'processing'
  - Fetches data from analytics rollup tables
   - Generates file (CSV/JSON)
   - Updates status to 'completed'
   - Stores file path
5. User downloads file via API

## Future Enhancements

1. **Job Priority Management**
   - Priority-based processing
   - Premium publisher priority

2. **Advanced Scheduling**
   - Publisher-specific schedules
   - Timezone-aware scheduling

3. **Job Dependencies**
   - Chain jobs together
   - Wait for prerequisites

4. **Better Monitoring**
   - Queue dashboard
   - Real-time metrics
   - Alert system

5. **Job Templates**
   - Pre-configured job types
   - One-click execution

## Related Files

- `backend/src/queues/queueManager.ts` - Queue manager and types
- `backend/src/queues/queueInitializer.ts` - Queue initialization
- `backend/src/queues/processors/analyticsAggregation.ts` - Analytics processor
- `backend/src/queues/processors/dataExport.ts` - Export processor
- `backend/src/routes/queues.routes.ts` - Queue API endpoints
- `backend/src/index.ts` - Server integration

## Dependencies

- **bullmq**: Modern Redis-based job queue
- **redis**: Redis client (shared with caching)
- **@fast-csv/format**: CSV file generation

## Testing

All existing tests pass (21/22 suites, 220 tests). Queue-specific testing should include:

- Job creation and processing
- Retry logic
- Error handling
- Scheduled job execution
- Queue metrics accuracy

## Conclusion

The background job scheduler provides a robust, scalable solution for asynchronous task processing. It integrates seamlessly with the existing Redis caching infrastructure and provides comprehensive monitoring and management capabilities.
