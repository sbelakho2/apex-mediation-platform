import { api } from '@/lib/api';
import { signToken } from '@/lib/auth';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { email, password, name, companyName } = await request.json();

    // Validate input
    if (!email || !password || !name) {
      return NextResponse.json(
        { success: false, error: 'Email, password, and name are required' },
        { status: 400 }
      );
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { success: false, error: 'Invalid email format' },
        { status: 400 }
      );
    }

    // Password validation
    if (password.length < 8) {
      return NextResponse.json(
        { success: false, error: 'Password must be at least 8 characters' },
        { status: 400 }
      );
    }

    // Call backend registration endpoint
    const response = await api.post('/api/v1/auth/register', {
      email,
      password,
      name,
      companyName,
    });

    if (!response.success || !response.data) {
      return NextResponse.json(
        { success: false, error: response.error || 'Registration failed' },
        { status: 400 }
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
    res.cookies.set('session', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: '/',
    });

    return res;
  } catch (error) {
    console.error('Registration error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
