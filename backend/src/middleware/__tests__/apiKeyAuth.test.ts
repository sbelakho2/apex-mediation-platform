import { apiKeyAuth } from '../apiKeyAuth';

// Mocks
const findOneMock = jest.fn();
const saveUsageMock = jest.fn();

jest.mock('../../database', () => ({
  AppDataSource: {
    getRepository: jest.fn((entity: any) => {
      return {
        findOne: findOneMock,
        save: saveUsageMock,
        update: jest.fn(async () => {}),
      } as any;
    }),
  },
}));

jest.mock('bcryptjs', () => ({
  __esModule: true,
  default: { compare: jest.fn(async (key: string, hash: string) => hash === 'bcrypt:'+key) },
}));

describe('apiKeyAuth middleware', () => {
  beforeEach(() => {
    findOneMock.mockReset();
    saveUsageMock.mockReset();
  });

  function makeRes() {
    const res: any = {};
    res.statusCode = 200;
    res.payload = null;
    res.status = (c: number) => { res.statusCode = c; return res; };
    res.json = (p: any) => { res.payload = p; return res; };
    res.header = (n: string) => undefined;
    return res;
  }

  it('rejects when API key missing', async () => {
    const req: any = { header: () => '', baseUrl: '/x', method: 'GET', ip: '1.1.1.1', get: () => '' };
    const res = makeRes();
    const next = jest.fn();
    await apiKeyAuth(req, res as any, next as any);
    expect(res.statusCode).toBe(401);
    expect(res.payload?.error).toBeDefined();
  });

  it('accepts valid API key (Authorization: Bearer)', async () => {
    const key = 'sk_test_abc';
    const digest = require('../../utils/crypto').sha256Hex(key);
    findOneMock.mockResolvedValue({ id: 'k1', secret: 'bcrypt:'+key, user: { id: 'u1', email: 'e@example.com', role: 'admin' } });

    const req: any = {
      header: (n: string) => n.toLowerCase() === 'authorization' ? `Bearer ${key}` : '',
      baseUrl: '/api/test',
      method: 'GET',
      ip: '1.2.3.4',
      get: () => 'UA',
    };
    const res = makeRes();
    const next = jest.fn();
    await apiKeyAuth(req, res as any, next as any);
    expect(next).toHaveBeenCalled();
    expect(req.user?.userId).toBe('u1');
    expect(findOneMock).toHaveBeenCalledWith({ where: { secretDigest: digest }, relations: ['user'] });
  });

  it('rejects invalid API key (wrong hash)', async () => {
    const key = 'sk_test_wrong';
    findOneMock.mockResolvedValue({ id: 'k1', secret: 'bcrypt:another', user: { id: 'u1' } });
    const req: any = {
      header: (n: string) => n.toLowerCase() === 'x-api-key' ? key : '',
      baseUrl: '/api/test', method: 'GET', ip: '1.2.3.4', get: () => 'UA'
    };
    const res = makeRes();
    const next = jest.fn();
    await apiKeyAuth(req, res as any, next as any);
    expect(res.statusCode).toBe(401);
  });
});
