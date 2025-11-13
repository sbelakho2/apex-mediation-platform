import { generateSignedComparison } from '../migrationComparisonSigner'
import type { MigrationMapping } from '../../types/migration'

describe('generateSignedComparison', () => {
  const sampleMappings: MigrationMapping[] = [
    {
      id: 'mapping-1',
      experiment_id: 'exp-1',
      incumbent_network: 'AppLovin',
      incumbent_instance_id: 'max-video',
      incumbent_instance_name: 'MAX Video',
      incumbent_waterfall_position: 1,
      incumbent_ecpm_cents: 320,
      mapping_status: 'pending',
      mapping_confidence: 'high',
      created_at: new Date(),
      updated_at: new Date(),
    },
  ]

  it('returns signed comparison metrics with signature metadata', () => {
    const result = generateSignedComparison(sampleMappings)

    expect(result.metrics.ecpm.control).toBeGreaterThan(0)
    expect(result.metrics.ecpm.test).toBeGreaterThan(result.metrics.ecpm.control)
    expect(result.metrics.fill.unit).toBe('percent')
    expect(result.signature.key_id).toBeTruthy()
    expect(result.signature.algo).toBe('ed25519')

    const payloadJson = Buffer.from(result.signature.payload_base64, 'base64').toString('utf8')
    const parsed = JSON.parse(payloadJson)

    expect(parsed.metrics.ecpm_cents.uplift_percent).toBeCloseTo(result.metrics.ecpm.uplift_percent, 2)
    expect(parsed.sample_size.control_impressions).toBeGreaterThan(0)
  })
})
