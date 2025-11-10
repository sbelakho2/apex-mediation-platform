/**
 * Request validation utilities for transparency API
 */

import { AppError } from '../middleware/errorHandler';

/**
 * Validate and parse ISO8601 date string
 * @throws AppError with 400 status if invalid
 */
export function validateISODate(value: string | undefined, fieldName: string): string | null {
  if (!value) return null;
  
  // ISO8601 regex pattern (basic validation)
  const iso8601Pattern = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})?)?$/;
  
  if (!iso8601Pattern.test(value)) {
    throw new AppError(
      `Invalid ${fieldName}: must be ISO8601 format (e.g., 2025-11-10 or 2025-11-10T12:00:00Z)`,
      400
    );
  }
  
  const d = new Date(value);
  if (isNaN(d.getTime())) {
    throw new AppError(`Invalid ${fieldName}: not a valid date`, 400);
  }
  
  return d.toISOString().replace('Z', ''); // ClickHouse DateTime64 format
}

/**
 * Validate and parse integer with min/max bounds
 * @throws AppError with 400 status if invalid
 */
export function validateInteger(
  value: string | undefined,
  fieldName: string,
  defaultValue: number,
  min: number,
  max: number
): number {
  if (!value) return defaultValue;
  
  const parsed = parseInt(value, 10);
  
  if (isNaN(parsed)) {
    throw new AppError(`Invalid ${fieldName}: must be an integer`, 400);
  }
  
  if (parsed < min || parsed > max) {
    throw new AppError(
      `Invalid ${fieldName}: must be between ${min} and ${max}`,
      400
    );
  }
  
  return parsed;
}

/**
 * Validate enum value against whitelist
 * @throws AppError with 400 status if invalid
 */
export function validateEnum(
  value: string | undefined,
  fieldName: string,
  allowedValues: string[]
): string | undefined {
  if (!value) return undefined;
  
  if (!allowedValues.includes(value)) {
    throw new AppError(
      `Invalid ${fieldName}: must be one of: ${allowedValues.join(', ')}`,
      400
    );
  }
  
  return value;
}

/**
 * Validate boolean flag
 * @throws AppError with 400 status if invalid
 */
export function validateBoolean(
  value: string | undefined,
  fieldName: string,
  defaultValue: boolean = false
): boolean {
  if (!value) return defaultValue;
  
  const lower = value.toLowerCase();
  
  if (lower === 'true' || lower === '1' || lower === 'yes') {
    return true;
  }
  
  if (lower === 'false' || lower === '0' || lower === 'no') {
    return false;
  }
  
  throw new AppError(
    `Invalid ${fieldName}: must be boolean (true/false, 1/0, yes/no)`,
    400
  );
}
