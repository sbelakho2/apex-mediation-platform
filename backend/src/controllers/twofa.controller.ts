import { Request, Response } from 'express';
import twofaService from '../services/twofa.service';
import logger from '../utils/logger';
import { twofaEventsTotal } from '../utils/prometheus';

export async function enroll(req: Request, res: Response) {
  const userId = req.user?.userId || 'anon';
  const email = (req.user as any)?.email || 'user@example.com';
  const issuer = process.env.TWOFA_ISSUER || 'ApexMediation';
  const data = await twofaService.enroll(userId, email, issuer);
  try { twofaEventsTotal.labels('enroll', 'success').inc(); } catch {}
  return res.json({ data });
}

export async function verify(req: Request, res: Response) {
  const userId = req.user?.userId || 'anon';
  const token = String(req.body?.token || '');
  try {
    const data = await twofaService.verifyAndEnable(userId, token);
    try { twofaEventsTotal.labels('verify', 'success').inc(); } catch {}
    return res.json({ data });
  } catch (e: any) {
    logger.warn('2FA verify failed', { userId, error: e?.message });
    try { twofaEventsTotal.labels('verify', 'failure').inc(); } catch {}
    return res.status(400).json({ error: e?.message || 'Verification failed' });
  }
}

export async function regenerateBackupCodes(req: Request, res: Response) {
  const userId = req.user?.userId || 'anon';
  try {
    const data = await twofaService.regenerateBackupCodes(userId);
    try { twofaEventsTotal.labels('regen', 'success').inc(); } catch {}
    return res.json({ data });
  } catch (e: any) {
    try { twofaEventsTotal.labels('regen', 'failure').inc(); } catch {}
    return res.status(400).json({ error: e?.message || 'Unable to regenerate backup codes' });
  }
}

export async function disable(req: Request, res: Response) {
  const userId = req.user?.userId || 'anon';
  const password: string = String(req.body?.password || '');
  const code: string = String(req.body?.code || '');
  try {
    // Validate password using current user (if available)
    const email = (req.user as any)?.email;
    if (!email) return res.status(401).json({ error: 'Unauthorized' });
    const { findUserByEmail } = await import('../repositories/userRepository');
    const user = await findUserByEmail(email);
    const bcrypt = (await import('bcryptjs')).default;
    const okPwd = user && (await bcrypt.compare(password, (user as any).password_hash));
    if (!okPwd) return res.status(400).json({ error: 'Invalid password' });
    // Verify provided 2FA code or backup code
    const ok2fa = await twofaService.verifyTokenOrBackupCode(userId, code);
    if (!ok2fa) return res.status(400).json({ error: 'Invalid 2FA code' });
    await twofaService.disable(userId);
    try { twofaEventsTotal.labels('disable', 'success').inc(); } catch {}
    return res.json({ data: { disabled: true } });
  } catch (e: any) {
    try { twofaEventsTotal.labels('disable', 'failure').inc(); } catch {}
    return res.status(400).json({ error: e?.message || 'Unable to disable 2FA' });
  }
}
