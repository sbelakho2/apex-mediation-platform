import { logger } from '../../utils/logger'

/**
 * Capture stdout output produced by winston Console transport so we can
 * assert redactions applied by the custom formatter.
 */
function captureStdout<T>(fn: () => T): { output: string; result: T } {
  const originalWrite = process.stdout.write as unknown as (chunk: any, encoding?: any, cb?: any) => boolean
  let buffer = ''
  // @ts-ignore
  process.stdout.write = (chunk: any): boolean => {
    buffer += chunk?.toString?.() ?? String(chunk)
    return true
  }
  try {
    const result = fn()
    return { output: buffer, result }
  } finally {
    // @ts-ignore
    process.stdout.write = originalWrite
  }
}

describe('logger redaction', () => {
  beforeAll(() => {
    process.env.NODE_ENV = 'production' // ensure JSON output for easier parsing
  })

  it('redacts emails, bearer tokens, stripe keys and long numeric sequences', () => {
    const msg = [
      'Contact user at john.doe@example.com',
      'Authorization: Bearer verySecretBearerToken123',
      'Stripe secret sk_live_51LYiXabcDEFghiJ',
      'Potential card: 4242424242424242',
    ].join(' | ')

    const { output } = captureStdout(() => {
      logger.info(msg, {
        authorization: 'Bearer topsecret',
        token: 'abc.def.ghi',
        stripeSecretKey: 'sk_test_ABC123',
        cardNumber: '4000056655665556',
      })
    })

    // Winston may emit multiple lines; search the last JSON object
    const lines = output
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
    const last = lines[lines.length - 1]
    expect(last).toBeTruthy()
    const obj = JSON.parse(last)

    // Message string redactions
    expect(obj.message).not.toContain('john.doe@example.com')
    expect(obj.message).toContain('[REDACTED_EMAIL]')
    expect(obj.message).not.toContain('verySecretBearerToken123')
    expect(obj.message).toContain('Bearer [REDACTED]')
    expect(obj.message).not.toContain('sk_live_')
    expect(obj.message).toContain('sk_live_[REDACTED]')
    expect(obj.message).not.toContain('4242424242424242')
    expect(obj.message).toContain('[REDACTED_NUMERIC]')

    // Structured field redactions
    expect(obj.authorization).toBe('[REDACTED]')
    expect(obj.token).toBe('[REDACTED]')
    expect(obj.stripeSecretKey).toBe('[REDACTED]')
    // Arbitrary string fields should pass through the regex redactor
    expect(typeof obj.cardNumber).toBe('string')
    expect(obj.cardNumber).toContain('[REDACTED_NUMERIC]')
  })
})
