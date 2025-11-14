import request from 'supertest';
import { createTestApp } from '../__tests__/helpers/testApp';

describe('Observability metrics', () => {
  const app = createTestApp();

  it('exposes auth_attempts_total and twofa_events_total in /metrics and increments on flows', async () => {
    // Trigger a failed login to increment auth_attempts_total{outcome="failure"}
    await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'nobody@example.com', password: 'wrongpass' })
      .expect(401);

    // Trigger 2FA enroll (success) and verify (failure) to increment twofa_events_total
    await request(app)
      .post('/api/v1/auth/2fa/enroll')
      .send({})
      .expect(200);

    await request(app)
      .post('/api/v1/auth/2fa/verify')
      .send({ token: '000000' })
      .expect(400);

    const res = await request(app).get('/metrics').expect(200);
    const text = res.text;
    expect(text).toMatch(/auth_attempts_total/);
    expect(text).toMatch(/twofa_events_total/);
    // Check labeled samples exist
    expect(text).toMatch(/auth_attempts_total\{outcome="failure"}\s+\d+/);
    expect(text).toMatch(/twofa_events_total\{event="enroll",outcome="success"}\s+\d+/);
    expect(text).toMatch(/twofa_events_total\{event="verify",outcome="failure"}\s+\d+/);
  });
});
