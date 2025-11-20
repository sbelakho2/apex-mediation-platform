import axios from 'axios'
import { DEFAULT_VENDOR_RULES, fetchAppAdsTxt, parseLines, inspectAgainstRules, inspectAppAds } from '../appAdsInspectorService'

jest.mock('axios')
const mockedAxios = axios as jest.Mocked<typeof axios>

describe('appAdsInspectorService', () => {
  afterEach(() => {
    jest.resetAllMocks()
  })

  describe('parseLines', () => {
    it('trims, removes comments and empty lines, handles CRLF', () => {
      const txt = `# comment\r\n\n google.com, pub-123, DIRECT, f08c47fec0942fa0 \n\n\r\n  unity.com, 9999, DIRECT  \n# tail`;
      const lines = parseLines(txt)
      expect(lines).toEqual([
        'google.com, pub-123, DIRECT, f08c47fec0942fa0',
        'unity.com, 9999, DIRECT',
      ])
    })
  })

  describe('inspectAgainstRules / fuzzy matching', () => {
    it('passes when required vendor templates are present (case-insensitive, token tolerant)', () => {
      const lines = [
        'Google.com, pub-AAAAAAAAAAAA, DIRECT, f08c47fec0942fa0',
        'unity.com, ABCDEF123456, DIRECT',
      ]
      const vendors = inspectAgainstRules(lines, DEFAULT_VENDOR_RULES.filter(v => ['admob','unity'].includes(v.vendor)))
      const admob = vendors.find(v => v.vendor === 'admob')!
      const unity = vendors.find(v => v.vendor === 'unity')!
      expect(admob.pass).toBe(true)
      expect(admob.missing).toEqual([])
      expect(unity.pass).toBe(true)
      expect(unity.missing).toEqual([])
    })

    it('suggests missing templates when not found', () => {
      const lines: string[] = []
      const vendors = inspectAgainstRules(lines, DEFAULT_VENDOR_RULES.filter(v => ['admob'].includes(v.vendor)))
      const admob = vendors[0]
      expect(admob.pass).toBe(false)
      expect(admob.missing.length).toBeGreaterThan(0)
      // suggested equals missing by design
      expect(admob.suggested).toEqual(admob.missing)
    })
  })

  describe('fetch + inspectAppAds', () => {
    it('returns fetched=false and preserves httpStatus on 404/5xx', async () => {
      mockedAxios.get.mockResolvedValueOnce({ status: 404, data: '' })
      const res = await inspectAppAds('missing.example')
      expect(res.fetched).toBe(false)
      expect(res.httpStatus).toBe(404)
      expect(res.vendors).toEqual([])
    })

    it('returns vendors with pass/fail on 200 and provides rawSample', async () => {
      const body = `# app-ads.txt\nGoogle.com, pub-AAAA, DIRECT, f08c47fec0942fa0\nunity.com, BBBB, DIRECT\n`;
      mockedAxios.get.mockResolvedValueOnce({ status: 200, data: body })
      const res = await inspectAppAds('ok.example')
      expect(res.fetched).toBe(true)
      expect(res.httpStatus).toBe(200)
      // At least admob/unity are in default rules; both should pass for our body
      const admob = res.vendors.find(v => v.vendor === 'admob')
      const unity = res.vendors.find(v => v.vendor === 'unity')
      expect(admob?.pass).toBe(true)
      expect(unity?.pass).toBe(true)
      expect(res.rawSample).toContain('Google.com')
    })
  })
})
