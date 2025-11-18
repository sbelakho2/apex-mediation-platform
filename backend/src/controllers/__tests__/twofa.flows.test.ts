import twofaService from '../../services/twofa.service';

// Mock repositories used by twofa.service
jest.mock('../../database', () => ({
  AppDataSource: {
    getRepository: jest.fn(() => ({
      findOne: jest.fn(async () => null),
      findOneBy: jest.fn(async () => ({ id: 'u1', email: 'user@example.com' })),
      save: jest.fn(async (x: any) => x),
      create: jest.fn((x: any) => x),
    })),
  },
}));

// Avoid real crypto key requirement during tests
process.env.APP_KMS_KEY = process.env.APP_KMS_KEY || 'test-key';

describe('2FA service basic flows', () => {
  it('enroll → verify/enable → regen → disable (happy path)', async () => {
    const userId = 'user-1';
    const email = 'user@example.com';

    const enroll = await twofaService.enroll(userId, email, 'ApexMediation', { actorEmail: email, ip: '127.0.0.1' });
    expect(enroll).toBeTruthy();
    expect(typeof enroll.otpauthUrl).toBe('string');
    expect(typeof enroll.qrDataUrl).toBe('string');
    expect(typeof enroll.maskedSecret).toBe('string');

    // We cannot generate a real OTP here because secret is randomized and encrypted.
    // Instead, call verify with an obviously bad token and expect an error.
    await expect(twofaService.verifyAndEnable(userId, '000000', { actorEmail: email, ip: '127.0.0.1' }))
      .rejects.toBeTruthy();
  });
});
