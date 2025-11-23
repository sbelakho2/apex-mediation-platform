import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AppError } from './errorHandler';
import logger from '../utils/logger';
import { isAuthTokenPayload } from '../types/auth';
import type { AuthTokenPayload } from '../types/auth';

// Extend Express Request to include user
declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthTokenPayload;
  }
}

/**
 * Authentication middleware - verifies JWT token and attaches user to request
 */
export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // In test harnesses we sometimes inject a synthetic user before hitting auth middleware.
    // Honor that short-circuit to keep controller/unit tests lightweight while preserving prod behavior.
    if (process.env.NODE_ENV === 'test' && req.user) {
      next();
      return;
    }
    // Get token from Authorization header or httpOnly cookie (access_token)
    const authHeader = req.headers.authorization;
    let token: string | null = null;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    } else {
      const cookieName = process.env.ACCESS_TOKEN_COOKIE_NAME || 'access_token';
      const cookies = (req as Request & { cookies?: Record<string, string | undefined> }).cookies;
      token = (cookies && cookies[cookieName]) ? String(cookies[cookieName]) : null;
    }

    if (!token) {
      throw new AppError('No token provided', 401);
    }

    // Verify token
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      logger.error('JWT_SECRET not configured');
      throw new AppError('Authentication configuration error', 500);
    }

    const decoded = jwt.verify(token, jwtSecret);

    if (!isAuthTokenPayload(decoded)) {
      throw new AppError('Invalid token payload', 401);
    }

    // Attach user to request
    req.user = decoded;

    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      next(new AppError('Invalid token', 401));
    } else if (error instanceof jwt.TokenExpiredError) {
      next(new AppError('Token expired', 401));
    } else {
      next(error);
    }
  }
};

/**
 * RBAC authorization middleware
 */
export const authorize = (roles: Array<'admin' | 'publisher' | 'readonly'>) => {
  return (req: Request, _res: Response, next: NextFunction) => {
    const role = req.user?.role ?? 'publisher';
    if (!roles.includes(role)) {
      return next(new AppError('Forbidden', 403));
    }
    next();
  };
};
