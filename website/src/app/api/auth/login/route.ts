import { api } from '@/lib/api';
import { signToken } from '@/lib/auth';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { email, password, rememberMe } = await request.json();

    // Validate input
    if (!email || !password) {
      return NextResponse.json(
        { success: false, error: 'Email and password are required' },
        { status: 400 }
      );
    }

    // Call backend auth endpoint
    const response = await api.post('/auth/login', {
      email,
      password,
    });

    if (!response.success || !response.data) {
      return NextResponse.json(
        { success: false, error: response.error || 'Invalid credentials' },
        { status: response.status === 429 ? 429 : 401 }
      );
    }

    const user = response.data.user;

    // Generate JWT for website
    const token = await signToken({
      id: user.id,
      email: user.email,
      publisherId: user.publisherId || user.id,
      role: user.role || 'developer',
      name: user.name,
    });

    // Create response with user data
    const res = NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        publisherId: user.publisherId || user.id,
        role: user.role || 'developer',
        name: user.name,
      },
    });

    // Set httpOnly cookie
    // If rememberMe is true, extend duration; otherwise session cookie (no maxAge)
    const cookieOptions: Parameters<typeof res.cookies.set>[2] = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
    };
    if (rememberMe) {
      cookieOptions.maxAge = 60 * 60 * 24 * 30; // 30 days
    }
    res.cookies.set('session', token, cookieOptions);

    return res;
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
