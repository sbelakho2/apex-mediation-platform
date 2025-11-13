import { parseMigrationCsv } from '../migrationCsvParser'

const ironSourceCsv = `network,instance_id,instance_name,waterfall_position,ecpm_cents\nironSource,is-rv-template,Rewarded Video,1,275\nironSource,is-int-template,Interstitial,2,180\n`

const maxCsv = `provider,InstanceID,Label,rank,floor_cents\nAppLovin,max-video-template,MAX Video,1,320\nAppLovin,max-banner-template,MAX Banner,3,95\n`

describe('parseMigrationCsv', () => {
  it('parses the ironSource template and normalizes fields', () => {
    const rows = parseMigrationCsv(Buffer.from(ironSourceCsv, 'utf8'))

    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({
      network: 'ironSource',
      instanceId: 'is-rv-template',
      instanceName: 'Rewarded Video',
      waterfallPosition: 1,
      ecpmCents: 275,
      confidence: 'high',
    })
  })

  it('parses the MAX template and infers confidence', () => {
    const rows = parseMigrationCsv(Buffer.from(maxCsv, 'utf8'))

    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({
      network: 'AppLovin',
      instanceId: 'max-video-template',
      instanceName: 'MAX Video',
      waterfallPosition: 1,
      ecpmCents: 320,
      confidence: 'high',
    })
  })

  it('throws when required columns are missing', () => {
    expect(() => {
      parseMigrationCsv(Buffer.from('network\nAppLovin\n', 'utf8'))
    }).toThrow('Missing required columns')
  })

  it('throws when numeric fields are invalid', () => {
    const invalidCsv = `network,instance_id,waterfall_position\nAppLovin,max-1,NaN\n`
    expect(() => parseMigrationCsv(Buffer.from(invalidCsv, 'utf8'))).toThrow('Invalid numeric value')
  })
})
