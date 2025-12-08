import request from 'supertest';
import express, { Application } from 'express';
import configRoutes from '../config.routes';
import { generateTestKeypair, signConfig, RemoteConfig } from '../../services/configValidationService';

describe('Config Routes', () => {
  let app: Application;
  const { publicKeyDer, privateKeyDer } = generateTestKeypair();

  function baseConfig(): RemoteConfig {
    const cfg: RemoteConfig = {
      configId: 'cfg-1',
      version: 1,
      timestamp: 1_735_000_000,
      placements: {
        pl1: {
          placementId: 'pl1',
          adType: 'INTERSTITIAL',
          enabledNetworks: [],
          timeoutMs: 3_000,
          maxWaitMs: 5_000,
          floorPrice: 0,
          refreshInterval: null,
          targeting: {},
        },
      },
      adapters: {},
      features: {},
      signature: 'pending',
    };
    return cfg;
  }

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api/v1/config', configRoutes);
  });

  it('accepts a valid signed config', async () => {
    const cfg = baseConfig();
    cfg.signature = signConfig(cfg, privateKeyDer);

    await request(app)
      .post('/api/v1/config/validate')
      .send({ config: cfg, publicKeyBase64: publicKeyDer.toString('base64') })
      .expect(200)
      .expect((res) => {
        expect(res.body.success).toBe(true);
      });
  });

  it('rejects schema violations (timeout too large)', async () => {
    const cfg = baseConfig();
    cfg.placements.pl1.timeoutMs = 60_000; // exceeds bound
    cfg.signature = signConfig(cfg, privateKeyDer);

    await request(app)
      .post('/api/v1/config/validate')
      .send({ config: cfg, publicKeyBase64: publicKeyDer.toString('base64') })
      .expect(400)
      .expect((res) => {
        expect(res.body.success).toBe(false);
        expect(res.body.errors).toEqual(expect.arrayContaining([expect.stringContaining('timeoutMs')]));
      });
  });

  it('rejects tampered signatures', async () => {
    const cfg = baseConfig();
    cfg.signature = signConfig(cfg, privateKeyDer);
    // Tamper after signing
    cfg.version = 2;

    await request(app)
      .post('/api/v1/config/validate')
      .send({ config: cfg, publicKeyBase64: publicKeyDer.toString('base64') })
      .expect(400)
      .expect((res) => {
        expect(res.body.success).toBe(false);
        expect(res.body.errors).toEqual(expect.arrayContaining(['signature verification failed']));
      });
  });

  it('rejects when publicKeyBase64 is missing', async () => {
    const cfg = baseConfig();
    cfg.signature = signConfig(cfg, privateKeyDer);

    await request(app)
      .post('/api/v1/config/validate')
      .send({ config: cfg })
      .expect(400)
      .expect((res) => {
        expect(res.body.success).toBe(false);
        expect(res.body.errors).toEqual(expect.arrayContaining(['config and publicKeyBase64 are required']));
      });
  });

  it('rejects when publicKeyBase64 is invalid base64', async () => {
    const cfg = baseConfig();
    cfg.signature = signConfig(cfg, privateKeyDer);

    await request(app)
      .post('/api/v1/config/validate')
      .send({ config: cfg, publicKeyBase64: '***not_base64***' })
      .expect(400)
      .expect((res) => {
        expect(res.body.success).toBe(false);
        expect(res.body.errors).toEqual(expect.arrayContaining([expect.stringContaining('asymmetric key')]));
      });
  });

  it('computes next rollout step and handles rollback', async () => {
    await request(app)
      .post('/api/v1/config/rollout/next')
      .send({ currentPercent: 1, sloBreached: false })
      .expect(200)
      .expect((res) => {
        expect(res.body.success).toBe(true);
        expect(res.body.data.next).toBe(5);
        expect(res.body.data.rolledBack).toBe(false);
      });

    await request(app)
      .post('/api/v1/config/rollout/next')
      .send({ currentPercent: 5, sloBreached: true })
      .expect(200)
      .expect((res) => {
        expect(res.body.data.next).toBe(0);
        expect(res.body.data.rolledBack).toBe(true);
      });
  });
});
