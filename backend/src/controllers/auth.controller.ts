import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import ms from 'ms';
import { z } from 'zod';
import { AppError } from '../middleware/errorHandler';
import logger from '../utils/logger';
import { createUserWithPublisher, findUserByEmail } from '../repositories/userRepository';
import {
  insertRefreshToken,
  findRefreshTokenById,
  revokeRefreshToken,
} from '../repositories/refreshTokenRepository';
import { isAuthTokenPayload } from '../types/auth';
import crypto from 'crypto';
import { setAuthCookies } from '../utils/cookies';

// Validation schemas
export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  companyName: z.string().min(2),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(32),
});

const resolveExpirationSeconds = (
  rawValue: string | undefined,
  fallback: string,
  configKey: string
): number => {
  const raw = rawValue || fallback;

  if (/^\d+$/.test(raw)) {
    return Math.max(1, Number(raw));
  }

  const durationMs = ms(raw);

  if (typeof durationMs === 'number' && Number.isFinite(durationMs)) {
    return Math.max(1, Math.floor(durationMs / 1000));
  }

  logger.error(`Invalid ${configKey} value provided`, { raw });
  throw new AppError(`${configKey} configuration error`, 500);
};

const resolveAccessTokenExpirationSeconds = (): number => {
  return resolveExpirationSeconds(process.env.JWT_EXPIRES_IN, '7d', 'JWT_EXPIRES_IN');
};

const resolveRefreshTokenExpirationSeconds = (): number => {
  return resolveExpirationSeconds(
    process.env.REFRESH_TOKEN_EXPIRES_IN,
    '30d',
    'REFRESH_TOKEN_EXPIRES_IN'
  );
};

const getAccessTokenSecret = (): string => {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new AppError('JWT configuration error', 500);
  }

  return secret;
};

const getRefreshTokenSecret = (): string => {
  const secret = process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET;

  if (!secret) {
    throw new AppError('JWT refresh configuration error', 500);
  }

  return secret;
};

type TokenPayload = {
  userId: string;
  publisherId: string;
  email: string;
  role?: 'admin' | 'publisher' | 'readonly';
};

interface RefreshTokenIssueOptions {
  userAgent?: string;
  ipAddress?: string;
}

const issueAccessToken = (payload: TokenPayload) => {
  const expiresInSeconds = resolveAccessTokenExpirationSeconds();
  const token = jwt.sign({ ...payload, tokenType: 'access' }, getAccessTokenSecret(), {
    expiresIn: expiresInSeconds,
  });

  return { token, expiresInSeconds } as const;
};

const issueRefreshToken = async (
  payload: TokenPayload,
  options: RefreshTokenIssueOptions = {}
) => {
  const expiresInSeconds = resolveRefreshTokenExpirationSeconds();
  const id = randomUUID();
  const idHash = crypto.createHash('sha256').update(id).digest('hex');
  const expiresAt = new Date(Date.now() + expiresInSeconds * 1000);

  const record = await insertRefreshToken({
    id: idHash, // store hashed id only
    userId: payload.userId,
    expiresAt,
    userAgent: options.userAgent,
    ipAddress: options.ipAddress,
  });

  const token = jwt.sign({ ...payload, tokenType: 'refresh' }, getRefreshTokenSecret(), {
    expiresIn: expiresInSeconds,
    jwtid: record.id, // jti is hashed id
    subject: payload.userId,
  });

  return {
    token,
    id: record.id,
    expiresAt: record.expiresAt,
    expiresInSeconds,
  } as const;
};

/**
 * Login user and return JWT token
 */
export const login = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // Validate request body
    const { email, password } = loginSchema.parse(req.body);

    const user = await findUserByEmail(email);

    if (!user) {
      throw new AppError('Invalid email or password', 401);
    }

    const passwordMatches = await bcrypt.compare(password, user.password_hash);

    if (!passwordMatches) {
      throw new AppError('Invalid email or password', 401);
    }

    const tokenPayload: TokenPayload = {
      userId: user.id,
      publisherId: user.publisher_id,
      email,
      role: (user as any).role || 'publisher',
    };

    const accessToken = issueAccessToken(tokenPayload);
    const refreshToken = await issueRefreshToken(tokenPayload, {
      userAgent: req.get('user-agent') ?? undefined,
      ipAddress: req.ip,
    });

    logger.info(`User logged in: ${email}`);

    // Set httpOnly cookies (access + refresh)
    setAuthCookies(res, {
      accessToken: accessToken.token,
      accessExpiresInSeconds: accessToken.expiresInSeconds,
      refreshToken: refreshToken.token,
      refreshExpiresInSeconds: refreshToken.expiresInSeconds,
    });

    res.json({
      success: true,
      data: {
        token: accessToken.token,
        tokenExpiresIn: accessToken.expiresInSeconds,
        refreshToken: refreshToken.token,
        refreshTokenExpiresAt: refreshToken.expiresAt.toISOString(),
        refreshTokenExpiresIn: refreshToken.expiresInSeconds,
        user: {
          id: user.id,
          email,
          publisherId: user.publisher_id,
          companyName: user.company_name,
          role: (user as any).role || 'publisher',
        },
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new AppError('Invalid request data', 400));
      return;
    }

    next(error);
  }
};

/**
 * Register new user
 */
export const register = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // Validate request body
    const { email, password, companyName } = registerSchema.parse(req.body);

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    const existingUser = await findUserByEmail(email);

    if (existingUser) {
      throw new AppError('Email is already registered', 409);
    }

    const { user } = await createUserWithPublisher(email, passwordHash, companyName);

    const tokenPayload: TokenPayload = {
      userId: user.id,
      publisherId: user.publisherId,
      email,
      role: 'publisher',
    };

    const accessToken = issueAccessToken(tokenPayload);
    const refreshToken = await issueRefreshToken(tokenPayload, {
      userAgent: req.get('user-agent') ?? undefined,
      ipAddress: req.ip,
    });

    logger.info(`User registered: ${email}`);

    // Set httpOnly cookies (access + refresh)
    setAuthCookies(res, {
      accessToken: accessToken.token,
      accessExpiresInSeconds: accessToken.expiresInSeconds,
      refreshToken: refreshToken.token,
      refreshExpiresInSeconds: refreshToken.expiresInSeconds,
    });

    res.status(201).json({
      success: true,
      data: {
        token: accessToken.token,
        tokenExpiresIn: accessToken.expiresInSeconds,
        refreshToken: refreshToken.token,
        refreshTokenExpiresAt: refreshToken.expiresAt.toISOString(),
        refreshTokenExpiresIn: refreshToken.expiresInSeconds,
        user: {
          id: user.id,
          email,
          publisherId: user.publisherId,
          companyName: user.companyName,
          role: 'publisher',
        },
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new AppError('Invalid request data', 400));
      return;
    }

    if ((error as { code?: string }).code === '23505') {
      next(new AppError('Email is already registered', 409));
      return;
    }

    next(error);
  }
};

/**
 * Refresh access token
 */
export const refresh = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // Accept refresh token from cookie first, then body as fallback
    const cookieName = process.env.REFRESH_TOKEN_COOKIE_NAME || 'refresh_token';
    const tokenFromCookie = (req as any).cookies?.[cookieName];
    const tokenFromBody = (req.body && (req.body as any).refreshToken) || undefined;
    const candidateToken = tokenFromCookie || tokenFromBody;
    const { refreshToken } = refreshSchema.parse({ refreshToken: candidateToken });

    const decodedToken = jwt.verify(refreshToken, getRefreshTokenSecret());

    if (typeof decodedToken === 'string') {
      throw new AppError('Invalid refresh token', 401);
    }

    if (!isAuthTokenPayload(decodedToken)) {
      throw new AppError('Invalid refresh token', 401);
    }

    const payload = decodedToken as jwt.JwtPayload & TokenPayload & {
      jti?: string;
      tokenType?: string;
    };

    const tokenId = typeof payload.jti === 'string' ? payload.jti : null;

    if (!tokenId) {
      throw new AppError('Invalid refresh token', 401);
    }

    if (payload.tokenType && payload.tokenType !== 'refresh') {
      throw new AppError('Invalid refresh token', 401);
    }

    const storedToken = await findRefreshTokenById(tokenId);

    if (!storedToken || storedToken.userId !== payload.userId) {
      throw new AppError('Invalid refresh token', 401);
    }

    if (storedToken.revokedAt || storedToken.replacedByToken) {
      throw new AppError('Refresh token revoked', 401);
    }

    if (storedToken.expiresAt.getTime() <= Date.now()) {
      await revokeRefreshToken(storedToken.id, 'expired');
      throw new AppError('Refresh token expired', 401);
    }

    const tokenPayload: TokenPayload = {
      userId: payload.userId,
      publisherId: payload.publisherId,
      email: payload.email,
      role: (payload as any).role || 'publisher',
    };

    // Enforce device/IP binding (configurable)
    const strictIP = process.env.STRICT_REFRESH_IP === '1';
    const reqUA = req.get('user-agent') || null;
    const reqIP = req.ip || null;
    if (storedToken.userAgent && reqUA && storedToken.userAgent !== reqUA) {
      await revokeRefreshToken(storedToken.id, 'ua_mismatch');
      throw new AppError('Refresh token invalid (UA mismatch)', 401);
    }
    if (strictIP && storedToken.ipAddress && reqIP && storedToken.ipAddress !== reqIP) {
      await revokeRefreshToken(storedToken.id, 'ip_mismatch');
      throw new AppError('Refresh token invalid (IP mismatch)', 401);
    }

    const accessToken = issueAccessToken(tokenPayload);
    const nextRefreshToken = await issueRefreshToken(tokenPayload, {
      userAgent: req.get('user-agent') ?? undefined,
      ipAddress: req.ip,
    });

    await revokeRefreshToken(storedToken.id, 'rotated', nextRefreshToken.id);

    // Update auth cookies
    setAuthCookies(res, {
      accessToken: accessToken.token,
      accessExpiresInSeconds: accessToken.expiresInSeconds,
      refreshToken: nextRefreshToken.token,
      refreshExpiresInSeconds: nextRefreshToken.expiresInSeconds,
    });

    res.json({
      success: true,
      data: {
        token: accessToken.token,
        tokenExpiresIn: accessToken.expiresInSeconds,
        refreshToken: nextRefreshToken.token,
        refreshTokenExpiresAt: nextRefreshToken.expiresAt.toISOString(),
        refreshTokenExpiresIn: nextRefreshToken.expiresInSeconds,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new AppError('Invalid request data', 400));
      return;
    }

    if (error instanceof jwt.TokenExpiredError) {
      next(new AppError('Refresh token expired', 401));
      return;
    }

    if (error instanceof jwt.JsonWebTokenError) {
      next(new AppError('Invalid refresh token', 401));
      return;
    }

    next(error);
  }
};

/**
 * Return current session user from access token (cookie or header)
 */
export const me = async (
  req: Request,
  res: Response,
  _next: NextFunction
): Promise<void> => {
  const user = (req as any).user as TokenPayload | undefined;
  if (!user) {
    res.status(401).json({ success: false, error: 'Unauthorized' });
    return;
  }
  res.json({ success: true, data: user });
};

/**
 * Logout: revoke refresh tokens for user and clear cookies
 */
export const logout = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const user = (req as any).user as TokenPayload | undefined;
    if (user?.userId) {
      try {
        const { revokeRefreshTokensForUser } = await import('../repositories/refreshTokenRepository');
        await revokeRefreshTokensForUser(user.userId, 'logout');
      } catch (_) {
        // best-effort
      }
    }
    const { clearAuthCookies } = await import('../utils/cookies');
    clearAuthCookies(res);
    res.json({ success: true });
  } catch (e) {
    next(e);
  }
};
