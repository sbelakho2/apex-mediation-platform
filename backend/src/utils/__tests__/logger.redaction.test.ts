import { redactLogInfo } from '../../utils/logger'

describe('logger redaction', () => {
  it('redacts emails, bearer tokens, stripe keys and long numeric sequences', () => {
    const info = {
      level: 'info',
      message: [
        'Contact user at john.doe@example.com',
        'Authorization: Bearer verySecretBearerToken123',
        'Stripe secret sk_live_51LYiXabcDEFghiJ',
        'Potential card: 4242424242424242',
      ].join(' | '),
      authorization: 'Bearer topsecret',
      token: 'abc.def.ghi',
      stripeSecretKey: 'sk_test_ABC123',
      cardNumber: '4000056655665556',
      metadata: 'Raw payload includes sk_test_Nested and email nested@example.com with 4111111111111111',
    }

    const redacted = redactLogInfo({ ...info }) as typeof info

    // Message string redactions
    expect(redacted.message).not.toContain('john.doe@example.com')
    expect(redacted.message).toContain('[REDACTED_EMAIL]')
    expect(redacted.message).not.toContain('verySecretBearerToken123')
    expect(redacted.message).toContain('Bearer [REDACTED]')
    expect(redacted.message).not.toContain('sk_live_51LYiXabcDEFghiJ')
    expect(redacted.message).toContain('sk_live_[REDACTED]')
    expect(redacted.message).not.toContain('4242424242424242')
    expect(redacted.message).toContain('[REDACTED_NUMERIC]')

    // Structured field redactions
    expect(redacted.authorization).toBe('[REDACTED]')
    expect(redacted.token).toBe('[REDACTED]')
    expect(redacted.stripeSecretKey).toBe('[REDACTED]')
    expect(redacted.cardNumber).toBe('[REDACTED]')

    // Non-sensitive string fields should have patterns redacted but remain strings
    expect(typeof redacted.metadata).toBe('string')
    expect(redacted.metadata).not.toContain('nested@example.com')
    expect(redacted.metadata).toContain('[REDACTED_EMAIL]')
    expect(redacted.metadata).not.toContain('4111111111111111')
    expect(redacted.metadata).toContain('[REDACTED_NUMERIC]')
    expect(redacted.metadata).not.toContain('sk_test_ABC123')
    expect(redacted.metadata).toContain('sk_test_[REDACTED]')
  })
})
