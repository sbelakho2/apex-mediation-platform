import { Response } from 'express';

const bool = (v: string | undefined, dflt = false) => (v == null ? dflt : v === '1' || v.toLowerCase?.() === 'true');

export interface TokenCookies {
  accessToken: string;
  accessExpiresInSeconds: number;
  refreshToken: string;
  refreshExpiresInSeconds: number;
}

export function setAuthCookies(res: Response, tokens: TokenCookies) {
  const secure = bool(process.env.COOKIE_SECURE, process.env.NODE_ENV === 'production');
  const sameSite: 'lax' | 'strict' | 'none' = (process.env.COOKIE_SAMESITE as any) || 'lax';
  const domain = process.env.COOKIE_DOMAIN || undefined;
  const path = '/';
  const accessName = process.env.ACCESS_TOKEN_COOKIE_NAME || 'access_token';
  const refreshName = process.env.REFRESH_TOKEN_COOKIE_NAME || 'refresh_token';

  res.cookie(accessName, tokens.accessToken, {
    httpOnly: true,
    secure,
    sameSite,
    domain,
    path,
    maxAge: tokens.accessExpiresInSeconds * 1000,
  });

  res.cookie(refreshName, tokens.refreshToken, {
    httpOnly: true,
    secure,
    sameSite,
    domain,
    path,
    maxAge: tokens.refreshExpiresInSeconds * 1000,
  });
}

export function clearAuthCookies(res: Response) {
  const secure = bool(process.env.COOKIE_SECURE, process.env.NODE_ENV === 'production');
  const sameSite: 'lax' | 'strict' | 'none' = (process.env.COOKIE_SAMESITE as any) || 'lax';
  const domain = process.env.COOKIE_DOMAIN || undefined;
  const path = '/';
  const accessName = process.env.ACCESS_TOKEN_COOKIE_NAME || 'access_token';
  const refreshName = process.env.REFRESH_TOKEN_COOKIE_NAME || 'refresh_token';

  res.cookie(accessName, '', { httpOnly: true, secure, sameSite, domain, path, maxAge: 0 });
  res.cookie(refreshName, '', { httpOnly: true, secure, sameSite, domain, path, maxAge: 0 });
}
