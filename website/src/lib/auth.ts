import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';

// Use environment variable for production
const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'your-secret-key-change-in-production'
);

export interface User {
  id: string;
  email: string;
  publisherId: string;
  role: 'admin' | 'developer' | 'viewer';
  name?: string;
}

export interface SessionPayload {
  userId: string;
  email: string;
  publisherId: string;
  role: string;
  iat?: number;
  exp?: number;
}

/**
 * Generate a JWT token for the user
 */
export async function signToken(user: User): Promise<string> {
  return new SignJWT({
    userId: user.id,
    publisherId: user.publisherId,
    email: user.email,
    role: user.role,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('7d')
    .setIssuedAt()
    .sign(JWT_SECRET);
}

/**
 * Verify and decode a JWT token
 */
export async function verifyToken(token: string): Promise<User | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);

    return {
      id: payload.userId as string,
      email: payload.email as string,
      publisherId: payload.publisherId as string,
      role: payload.role as 'admin' | 'developer' | 'viewer',
    };
  } catch (error) {
    console.error('Token verification failed:', error);
    return null;
  }
}

/**
 * Get the current user session
 */
export async function getSession(): Promise<User | null> {
  const cookieStore = cookies();
  const token = cookieStore.get('session')?.value;

  if (!token) {
    return null;
  }

  return verifyToken(token);
}

/**
 * Check if user is authenticated
 */
export async function isAuthenticated(): Promise<boolean> {
  const user = await getSession();
  return user !== null;
}

/**
 * Require authentication (for API routes and server components)
 */
export async function requireAuth(): Promise<User> {
  const user = await getSession();

  if (!user) {
    throw new Error('Unauthorized');
  }

  return user;
}
