import { getSession } from '@/lib/auth';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

function cacheHeaders() {
  return { 'Cache-Control': 'private, max-age=60' };
}

export async function GET() {
  try {
    const hasToken = !!cookies().get('session')?.value;
    const user = await getSession();

    if (!user) {
      // Provide a typed reason to help callers distinguish UI flows
      const reason = hasToken ? 'invalid_or_expired' : 'missing_token';
      return NextResponse.json(
        { success: false, error: 'Unauthorized', reason },
        { status: 401, headers: cacheHeaders() }
      );
    }

    return NextResponse.json(
      {
        success: true,
        user,
      },
      { status: 200, headers: cacheHeaders() }
    );
  } catch (error) {
    console.error('Session error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500, headers: cacheHeaders() }
    );
  }
}
