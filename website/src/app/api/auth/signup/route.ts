import { api } from '@/lib/api';
import { signToken } from '@/lib/auth';
import { NextRequest, NextResponse } from 'next/server';

function isValidEmail(email: string) {
  // RFC 5322-lite, pragmatic validation
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

function isStrongPassword(pw: string) {
  if (pw.length < 10) return false;
  let classes = 0;
  if (/[a-z]/.test(pw)) classes++;
  if (/[A-Z]/.test(pw)) classes++;
  if (/[0-9]/.test(pw)) classes++;
  if (/[^A-Za-z0-9]/.test(pw)) classes++;
  return classes >= 3;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const email = (body?.email ?? '').toString();
    const password = (body?.password ?? '').toString();
    const name = (body?.name ?? '').toString();
    const companyName = (body?.companyName ?? '').toString();
    const consent = !!body?.consent;
    const honeypot = (body?.hp ?? body?.company)?.toString?.() ?? '';
    const bankAccountPayload = body?.bankAccount ?? {};

    // Validate input
    if (!email || !password || !name) {
      return NextResponse.json(
        { success: false, error: 'Email, password, and name are required' },
        { status: 400 }
      );
    }

    // Email validation
    if (!isValidEmail(email)) {
      return NextResponse.json(
        { success: false, error: 'Invalid email format' },
        { status: 400 }
      );
    }

    // Password validation
    if (!isStrongPassword(password)) {
      return NextResponse.json(
        { success: false, error: 'Password must be at least 10 characters and include 3 of: upper, lower, number, symbol.' },
        { status: 400 }
      );
    }

    // Require consent checkbox
    if (!consent) {
      return NextResponse.json(
        { success: false, error: 'Consent to Terms and Privacy Policy is required' },
        { status: 400 }
      );
    }

    // Honeypot: short-circuit pretend success to avoid leaking signal to bots
    if (honeypot) {
      return NextResponse.json({ success: true }, { status: 200 });
    }

    // Require SEPA or ACH banking details so invoices can auto-debit
    const scheme = bankAccountPayload?.scheme === 'ach' ? 'ach' : 'sepa';
    const accountHolderName = (bankAccountPayload?.accountHolderName ?? companyName ?? name).toString().trim();

    if (!accountHolderName) {
      return NextResponse.json(
        { success: false, error: 'Account holder name is required' },
        { status: 400 }
      );
    }

    let bankAccount;
    if (scheme === 'sepa') {
      const iban = (bankAccountPayload?.iban ?? '').toString().replace(/\s+/g, '').toUpperCase();
      const bic = (bankAccountPayload?.bic ?? '').toString().replace(/\s+/g, '').toUpperCase();
      const ibanValid = /^[A-Z0-9]{15,34}$/.test(iban);
      const bicValid = /^[A-Z0-9]{8}([A-Z0-9]{3})?$/.test(bic);
      if (!ibanValid || !bicValid) {
        return NextResponse.json(
          { success: false, error: 'Valid IBAN and BIC are required for SEPA debits' },
          { status: 400 }
        );
      }
      bankAccount = { scheme: 'sepa' as const, accountHolderName, iban, bic };
    } else {
      const accountNumber = (bankAccountPayload?.accountNumber ?? '').toString().replace(/\s+/g, '');
      const routingNumber = (bankAccountPayload?.routingNumber ?? '').toString().replace(/[^0-9]/g, '');
      const accountType = bankAccountPayload?.accountType === 'SAVINGS' ? 'SAVINGS' : 'CHECKING';
      const acctValid = /^[0-9]{4,17}$/.test(accountNumber);
      const routingValid = /^[0-9]{9}$/.test(routingNumber);
      if (!acctValid || !routingValid) {
        return NextResponse.json(
          { success: false, error: 'Valid ACH account and routing numbers are required' },
          { status: 400 }
        );
      }
      bankAccount = {
        scheme: 'ach' as const,
        accountHolderName,
        accountNumber,
        routingNumber,
        accountType,
      };
    }

    // Call backend registration endpoint
    const response = await api.post('/auth/register', {
      email,
      password,
      name,
      companyName,
      bankAccount,
    });

    if (!response.success || !response.data) {
      return NextResponse.json(
        { success: false, error: response.error || 'Registration failed' },
        { status: response.status === 429 ? 429 : 400 }
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
