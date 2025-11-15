import { authenticator } from 'otplib';
import bcrypt from 'bcryptjs';
import * as qrcode from 'qrcode';
import logger from '../utils/logger';
import { AppDataSource } from '../database';
import { TwoFactorAuth } from '../database/entities/twoFactorAuth.entity';
import { User } from '../database/entities/user.entity';

const tfaRepository = AppDataSource.getRepository(TwoFactorAuth);
const userRepository = AppDataSource.getRepository(User);

const maskSecret = (secret: string) => secret.replace(/.(?=.{4})/g, '*');

export const twofaService = {
  async isEnabled(userId: string): Promise<boolean> {
    const tfaRecord = await tfaRepository.findOne({ where: { user: { id: userId } } });
    return tfaRecord?.enabled === true;
  },

  async enroll(userId: string, email: string, issuer = 'ApexMediation') {
    const user = await userRepository.findOneBy({ id: userId });
    if (!user) throw new Error('User not found');

    let tfaRecord = await tfaRepository.findOne({ where: { user: { id: userId } } });
    if (!tfaRecord) {
      const secret = authenticator.generateSecret();
      tfaRecord = tfaRepository.create({ user, secret, enabled: false, backupCodes: [] });
    }
    
    await tfaRepository.save(tfaRecord);

    const otpauthUrl = authenticator.keyuri(email, issuer, tfaRecord.secret);
    const qrDataUrl = await qrcode.toDataURL(otpauthUrl);
    logger.info('2FA enroll started', { userId, issuer });
    return { otpauthUrl, qrDataUrl, maskedSecret: maskSecret(tfaRecord.secret) };
  },

  async verifyAndEnable(userId: string, token: string): Promise<{ backupCodes: string[] }> {
    const tfaRecord = await tfaRepository.findOne({ where: { user: { id: userId } }, relations: ['user'] });
    if (!tfaRecord) throw new Error('No enrollment in progress');

    const ok = authenticator.verify({ token, secret: tfaRecord.secret });
    if (!ok) throw new Error('Invalid token');

    const codes = Array.from({ length: 10 }, () =>
      Math.random().toString(36).replace(/[^a-z0-9]/gi, '').slice(-10)
    );
    
    const hashedCodes = await Promise.all(codes.map((c) => bcrypt.hash(c, 10)));

    tfaRecord.enabled = true;
    tfaRecord.backupCodes = hashedCodes;
    await tfaRepository.save(tfaRecord);

    logger.info('2FA enabled', { userId });
    return { backupCodes: codes };
  },

  async verifyTokenOrBackupCode(userId: string, code: string): Promise<boolean> {
    const tfaRecord = await tfaRepository.findOne({ where: { user: { id: userId } } });
    if (!tfaRecord) return false;

    if (authenticator.check(code, tfaRecord.secret)) return true;

    for (let i = 0; i < tfaRecord.backupCodes.length; i++) {
      const hashedCode = tfaRecord.backupCodes[i];
      if (await bcrypt.compare(code, hashedCode)) {
        tfaRecord.backupCodes.splice(i, 1);
        await tfaRepository.save(tfaRecord);
        logger.info('2FA backup code used', { userId });
        return true;
      }
    }
    return false;
  },

  async regenerateBackupCodes(userId: string): Promise<{ backupCodes: string[] }> {
    const tfaRecord = await tfaRepository.findOne({ where: { user: { id: userId } } });
    if (!tfaRecord || !tfaRecord.enabled) throw new Error('2FA not enabled');

    const codes = Array.from({ length: 10 }, () =>
      Math.random().toString(36).replace(/[^a-z0-9]/gi, '').slice(-10)
    );
    
    tfaRecord.backupCodes = await Promise.all(codes.map((c) => bcrypt.hash(c, 10)));
    await tfaRepository.save(tfaRecord);

    logger.info('2FA backup codes regenerated', { userId });
    return { backupCodes: codes };
  },

  async disable(userId: string) {
    const tfaRecord = await tfaRepository.findOne({ where: { user: { id: userId } } });
    if (!tfaRecord) return;

    tfaRecord.enabled = false;
    tfaRecord.backupCodes = [];
    await tfaRepository.save(tfaRecord);
    
    logger.info('2FA disabled', { userId });
  },
};

export default twofaService;
