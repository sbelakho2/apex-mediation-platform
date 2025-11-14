import { authenticator } from 'otplib';
import bcrypt from 'bcryptjs';
import * as qrcode from 'qrcode';
import logger from '../utils/logger';

export type TwoFARecord = {
  secret: string;
  enabled: boolean;
  backupCodesHash: string[]; // bcrypt hashes
};

const store: Map<string, TwoFARecord> = new Map();

const maskSecret = (secret: string) => secret.replace(/.(?=.{4})/g, '*');

export const twofaService = {
  isEnabled(userId: string): boolean {
    const r = store.get(userId);
    return r?.enabled === true;
  },

  async enroll(userId: string, email: string, issuer = 'ApexMediation') {
    let r = store.get(userId);
    if (!r) {
      r = { secret: authenticator.generateSecret(), enabled: false, backupCodesHash: [] };
      store.set(userId, r);
    }
    const otpauthUrl = authenticator.keyuri(email, issuer, r.secret);
    const qrDataUrl = await qrcode.toDataURL(otpauthUrl);
    logger.info('2FA enroll started', { userId, issuer });
    return { otpauthUrl, qrDataUrl, maskedSecret: maskSecret(r.secret) };
  },

  async verifyAndEnable(userId: string, token: string): Promise<{ backupCodes: string[] }> {
    const r = store.get(userId);
    if (!r) throw new Error('No enrollment in progress');
    const ok = authenticator.verify({ token, secret: r.secret });
    if (!ok) throw new Error('Invalid token');
    // generate 10 backup codes
    const codes = Array.from({ length: 10 }, () =>
      Math.random().toString(36).replace(/[^a-z0-9]/gi, '').slice(-10)
    );
    r.enabled = true;
    r.backupCodesHash = await Promise.all(codes.map((c) => bcrypt.hash(c, 10)));
    store.set(userId, r);
    logger.info('2FA enabled', { userId });
    return { backupCodes: codes };
  },

  async verifyTokenOrBackupCode(userId: string, code: string): Promise<boolean> {
    const r = store.get(userId);
    if (!r) return false;
    if (authenticator.check(code, r.secret)) return true;
    // check backup codes; if match, consume it
    for (let i = 0; i < r.backupCodesHash.length; i++) {
      const h = r.backupCodesHash[i];
      if (await bcrypt.compare(code, h)) {
        r.backupCodesHash.splice(i, 1);
        store.set(userId, r);
        logger.info('2FA backup code used', { userId });
        return true;
      }
    }
    return false;
  },

  async regenerateBackupCodes(userId: string): Promise<{ backupCodes: string[] }> {
    const r = store.get(userId);
    if (!r || !r.enabled) throw new Error('2FA not enabled');
    const codes = Array.from({ length: 10 }, () =>
      Math.random().toString(36).replace(/[^a-z0-9]/gi, '').slice(-10)
    );
    r.backupCodesHash = await Promise.all(codes.map((c) => bcrypt.hash(c, 10)));
    store.set(userId, r);
    logger.info('2FA backup codes regenerated', { userId });
    return { backupCodes: codes };
  },

  async disable(userId: string) {
    const r = store.get(userId);
    if (!r) return;
    r.enabled = false;
    r.backupCodesHash = [];
    store.set(userId, r);
    logger.info('2FA disabled', { userId });
  },
};

export default twofaService;
