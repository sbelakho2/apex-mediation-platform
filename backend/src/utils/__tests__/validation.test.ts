/**
 * Unit tests for transparency API validation utilities
 */

import {
  validateISODate,
  validateInteger,
  validateEnum,
  validateBoolean,
} from '../validation';
import { AppError } from '../../middleware/errorHandler';

describe('Transparency API Validation', () => {
  describe('validateISODate', () => {
    it('should accept valid ISO8601 date strings', () => {
      expect(validateISODate('2025-11-10', 'test')).toBeTruthy();
      expect(validateISODate('2025-11-10T12:00:00Z', 'test')).toBeTruthy();
      expect(validateISODate('2025-11-10T12:00:00.123Z', 'test')).toBeTruthy();
      expect(validateISODate('2025-11-10T12:00:00+02:00', 'test')).toBeTruthy();
    });

    it('should return null for undefined input', () => {
      expect(validateISODate(undefined, 'test')).toBeNull();
    });

    it('should throw AppError for invalid format', () => {
      expect(() => validateISODate('not-a-date', 'from')).toThrow(AppError);
      expect(() => validateISODate('2025/11/10', 'from')).toThrow(AppError);
      expect(() => validateISODate('11-10-2025', 'from')).toThrow(AppError);
    });

    it('should throw AppError for invalid dates', () => {
      expect(() => validateISODate('2025-13-40', 'from')).toThrow(AppError);
      expect(() => validateISODate('2025-02-30', 'from')).toThrow(AppError);
    });

    it('should throw with 400 status code', () => {
      try {
        validateISODate('invalid', 'from');
        fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(AppError);
        expect((err as AppError).statusCode).toBe(400);
      }
    });
  });

  describe('validateInteger', () => {
    it('should return default value for undefined input', () => {
      expect(validateInteger(undefined, 'limit', 50, 1, 500)).toBe(50);
    });

    it('should parse and validate integer within bounds', () => {
      expect(validateInteger('100', 'limit', 50, 1, 500)).toBe(100);
      expect(validateInteger('1', 'limit', 50, 1, 500)).toBe(1);
      expect(validateInteger('500', 'limit', 50, 1, 500)).toBe(500);
    });

    it('should throw AppError for non-integer values', () => {
      expect(() => validateInteger('abc', 'limit', 50, 1, 500)).toThrow(AppError);
      expect(() => validateInteger('12.5', 'limit', 50, 1, 500)).toThrow(AppError);
      expect(() => validateInteger('', 'limit', 50, 1, 500)).toThrow(AppError);
    });

    it('should throw AppError for out-of-bounds values', () => {
      expect(() => validateInteger('0', 'limit', 50, 1, 500)).toThrow(AppError);
      expect(() => validateInteger('501', 'limit', 50, 1, 500)).toThrow(AppError);
      expect(() => validateInteger('-10', 'page', 1, 1, 1000)).toThrow(AppError);
    });

    it('should throw with 400 status code', () => {
      try {
        validateInteger('999', 'limit', 50, 1, 500);
        fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(AppError);
        expect((err as AppError).statusCode).toBe(400);
      }
    });
  });

  describe('validateEnum', () => {
    const allowedValues = ['timestamp', 'winner_bid_ecpm', 'aletheia_fee_bp'];

    it('should return undefined for undefined input', () => {
      expect(validateEnum(undefined, 'sort', allowedValues)).toBeUndefined();
    });

    it('should return value if in whitelist', () => {
      expect(validateEnum('timestamp', 'sort', allowedValues)).toBe('timestamp');
      expect(validateEnum('winner_bid_ecpm', 'sort', allowedValues)).toBe('winner_bid_ecpm');
    });

    it('should throw AppError for values not in whitelist', () => {
      expect(() => validateEnum('invalid', 'sort', allowedValues)).toThrow(AppError);
      expect(() => validateEnum('TIMESTAMP', 'sort', allowedValues)).toThrow(AppError);
      expect(() => validateEnum('', 'sort', allowedValues)).toThrow(AppError);
    });

    it('should throw with 400 status code', () => {
      try {
        validateEnum('badvalue', 'sort', allowedValues);
        fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(AppError);
        expect((err as AppError).statusCode).toBe(400);
      }
    });
  });

  describe('validateBoolean', () => {
    it('should return default value for undefined input', () => {
      expect(validateBoolean(undefined, 'flag', false)).toBe(false);
      expect(validateBoolean(undefined, 'flag', true)).toBe(true);
    });

    it('should parse true values', () => {
      expect(validateBoolean('true', 'flag')).toBe(true);
      expect(validateBoolean('TRUE', 'flag')).toBe(true);
      expect(validateBoolean('1', 'flag')).toBe(true);
      expect(validateBoolean('yes', 'flag')).toBe(true);
      expect(validateBoolean('YES', 'flag')).toBe(true);
    });

    it('should parse false values', () => {
      expect(validateBoolean('false', 'flag')).toBe(false);
      expect(validateBoolean('FALSE', 'flag')).toBe(false);
      expect(validateBoolean('0', 'flag')).toBe(false);
      expect(validateBoolean('no', 'flag')).toBe(false);
      expect(validateBoolean('NO', 'flag')).toBe(false);
    });

    it('should throw AppError for invalid boolean values', () => {
      expect(() => validateBoolean('invalid', 'flag')).toThrow(AppError);
      expect(() => validateBoolean('2', 'flag')).toThrow(AppError);
      expect(() => validateBoolean('maybe', 'flag')).toThrow(AppError);
    });

    it('should throw with 400 status code', () => {
      try {
        validateBoolean('invalid', 'flag');
        fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(AppError);
        expect((err as AppError).statusCode).toBe(400);
      }
    });
  });
});
