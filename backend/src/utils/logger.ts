import winston from 'winston';
import { AsyncLocalStorage } from 'async_hooks';

const logLevel = process.env.LOG_LEVEL || 'info';

/**
 * Async context storage for request-scoped logging metadata
 * Allows propagating requestId, userId, tenantId across async operations
 */
export const asyncLocalStorage = new AsyncLocalStorage<{
  requestId?: string;
  userId?: string;
  tenantId?: string;
  [key: string]: any;
}>();

/**
 * Custom format that injects async context into logs
 */
const contextFormat = winston.format((info) => {
  const context = asyncLocalStorage.getStore();
  if (context) {
    return { ...info, ...context };
  }
  return info;
});

export const logger = winston.createLogger({
  level: logLevel,
  format: winston.format.combine(
    contextFormat(), // Inject async context first
    winston.format.timestamp({
      format: 'YYYY-MM-DD HH:mm:ss',
    }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json()
  ),
  defaultMeta: { service: 'apexmediation-api' },
  transports: [
    // Write all logs to console with structured JSON in production
    new winston.transports.Console({
      format: process.env.NODE_ENV === 'production'
        ? winston.format.json() // Structured JSON for log aggregation
        : winston.format.combine(
            winston.format.colorize(),
            winston.format.printf(
              ({ level, message, timestamp, requestId, userId, tenantId, ...metadata }) => {
                const printableTimestamp = timestamp ? String(timestamp) : '';
                const printableLevel = typeof level === 'string' ? level : String(level);
                const printableMessage = typeof message === 'string' ? message : JSON.stringify(message);

                let msg = `${printableTimestamp} [${printableLevel}]`;
                if (requestId) msg += ` [req:${requestId}]`;
                if (userId) msg += ` [user:${userId}]`;
                if (tenantId) msg += ` [tenant:${tenantId}]`;
                msg += `: ${printableMessage}`;
                
                // Filter out known fields from metadata
                const filteredMeta = { ...metadata };
                delete filteredMeta.service;
                delete filteredMeta.timestamp;
                
                if (Object.keys(filteredMeta).length > 0) {
                  msg += ` ${JSON.stringify(filteredMeta)}`;
                }
                return msg;
              }
            )
          ),
    }),
    // Write errors to error.log
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
    }),
    // Write all logs to combined.log
    new winston.transports.File({
      filename: 'logs/combined.log',
    }),
  ],
});

// Export as default for easier imports
export default logger;