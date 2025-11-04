import { NextResponse } from 'next/server';

export async function POST() {
  const res = NextResponse.json({ success: true, message: 'Logged out successfully' });

  // Delete the session cookie
  res.cookies.delete('session');

  return res;
}
