import { normalizeNetworkCsvReport, ingestNetworkCsvReport } from '../networkNormalizers';

// Mock Postgres helpers used in ingestion
jest.mock('../../../../utils/postgres', () => ({
  query: jest.fn(async () => ({ rows: [{ cnt: '0' }] })),
  insertMany: jest.fn(async () => {}),
}));

const { insertMany, query } = jest.requireMock('../../../../utils/postgres');

describe('VRA Network CSV Normalizers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('Unity: maps placement id/revenue headers and normalizes rows', () => {
    const csv = [
      'Date,Project ID,Placement ID,Country,Ad Type,Currency,Impressions,Clicks,Revenue',
      '2025-11-01,proj-1,plc-1,US,interstitial,USD,100,7,12.3456',
      '2025-11-01,proj-1,plc-2,GB,banner,GBP,50,,5.0000',
    ].join('\n');

    const { rows, errors } = normalizeNetworkCsvReport({
      network: 'unity',
      schemaVer: 1,
      reportId: 'rep-u1',
      csv,
    });

    expect(errors).toEqual([]);
    expect(rows.length).toBe(2);
    expect(rows[0]).toMatchObject({
      event_date: '2025-11-01',
      app_id: 'proj-1',
      ad_unit_id: 'plc-1',
      format: 'interstitial',
      currency: 'USD',
      impressions: 100,
      clicks: 7,
      paid: 12.3456,
      network: 'unity',
    });
    // Empty clicks should coerce to 0 when header is present but value is empty
    expect(rows[1]).toMatchObject({ clicks: 0, paid: 5.0, ad_unit_id: 'plc-2' });
  });

  it('AdMob: maps estimated earnings and app/ad unit headers', () => {
    const csv = [
      'Day,App ID,Ad Unit ID,Country,Ad Format,Currency,Impressions,Clicks,Estimated Earnings,Invalid Traffic',
      '2025-10-31,com.demo,unitA,CA,interstitial,CAD,1000,10,23.500000,0.100000',
    ].join('\n');

    const { rows, errors } = normalizeNetworkCsvReport({
      network: 'admob',
      schemaVer: 2,
      reportId: 'rep-a1',
      csv,
    });

    expect(errors).toEqual([]);
    expect(rows.length).toBe(1);
    expect(rows[0]).toMatchObject({
      event_date: '2025-10-31',
      app_id: 'com.demo',
      ad_unit_id: 'unitA',
      country: 'CA',
      format: 'interstitial',
      currency: 'CAD',
      impressions: 1000,
      clicks: 10,
      paid: 23.5,
      ivt_adjustments: 0.1,
      schema_ver: 2,
      network: 'admob',
    });
  });

  it('AppLovin: maps zone id to ad_unit_id and earnings to paid; ingest inserts raw and norm', async () => {
    (query as jest.Mock).mockResolvedValueOnce({ rows: [{ cnt: '0' }] });
    (query as jest.Mock).mockResolvedValueOnce({ rowCount: 1 });
    const csv = [
      'Date,Package Name,Zone ID,Country Code,Ad Format,Currency,Impressions,Clicks,Earnings',
      '2025-11-02,com.demo,ZONE-1,US,interstitial,USD,200,3,8.765432',
    ].join('\n');

    const out = await ingestNetworkCsvReport({
      network: 'applovin',
      schemaVer: 1,
      loadId: 'load-apx-1',
      reportId: 'rep-apx-1',
      csv,
    });

    expect(out.skipped).toBe(false);
    expect(out.normalizedRows).toBe(1);
    const tables = (insertMany as jest.Mock).mock.calls.map((c: any[]) => c[0]);
    expect(tables).toContain('recon_statements_norm');
    const rawSqls = (query as jest.Mock).mock.calls.map((call: unknown[]) => String(call[0] || ''));
    expect(rawSqls.some((sql) => sql.includes('recon_statements_raw'))).toBe(true);
  });

  it('ironSource: maps instance id and ad unit type, earnings to paid', () => {
    const csv = [
      'Date,App ID,Instance ID,Country,Ad Unit Type,Currency,Impressions,Clicks,Estimated Revenue',
      '2025-11-03,app.is,inst-1,DE,interstitial,EUR,300,4,9.876543',
    ].join('\n');

    const { rows, errors } = normalizeNetworkCsvReport({
      network: 'ironSource',
      schemaVer: 1,
      reportId: 'rep-is-1',
      csv,
    });

    expect(errors).toEqual([]);
    expect(rows.length).toBe(1);
    expect(rows[0]).toMatchObject({
      app_id: 'app.is',
      ad_unit_id: 'inst-1',
      country: 'DE',
      format: 'interstitial',
      currency: 'EUR',
      impressions: 300,
      clicks: 4,
      paid: 9.876543,
      network: 'ironSource',
    });
  });

  it('AdColony: maps zone id to ad_unit_id and earnings to paid', () => {
    const csv = [
      'Date,Bundle ID,Zone ID,Country,Ad Format,Currency,Impressions,Clicks,Revenue',
      '2025-11-03,com.colony,ZONE-9,FR,video,EUR,150,2,3.210000',
    ].join('\n');

    const { rows, errors } = normalizeNetworkCsvReport({
      network: 'adcolony',
      schemaVer: 1,
      reportId: 'rep-adc-1',
      csv,
    });

    expect(errors).toEqual([]);
    expect(rows[0]).toMatchObject({ ad_unit_id: 'ZONE-9', currency: 'EUR', paid: 3.21, format: 'video' });
  });

  it('Chartboost: maps location id to ad_unit_id', () => {
    const csv = [
      'Date,App,Location ID,Country,Ad Type,Currency,Impressions,Clicks,Revenue',
      '2025-11-03,com.cb,LOC-42,JP,interstitial,JPY,500,1,100.000000',
    ].join('\n');

    const { rows } = normalizeNetworkCsvReport({ network: 'chartboost', schemaVer: 1, reportId: 'rep-cb-1', csv });
    expect(rows[0]).toMatchObject({ ad_unit_id: 'LOC-42', country: 'JP', currency: 'JPY', impressions: 500, paid: 100 });
  });

  it('Vungle: maps placement id and Revenue (USD) to paid', () => {
    const csv = [
      'Date,App ID,Placement ID,Country,Ad Type,Currency,Impressions,Clicks,Revenue (USD)',
      '2025-11-03,app.vg,pl-1,US,video,USD,120,6,4.560000',
    ].join('\n');
    const { rows } = normalizeNetworkCsvReport({ network: 'vungle', schemaVer: 1, reportId: 'rep-vg-1', csv });
    expect(rows[0]).toMatchObject({ ad_unit_id: 'pl-1', paid: 4.56, format: 'video' });
  });

  it('Mintegral: maps unit id and earnings', () => {
    const csv = [
      'Date,App ID,Unit ID,Country,Ad Format,Currency,Impressions,Clicks,Earnings',
      '2025-11-03,app.mt,unit-7,IN,interstitial,INR,1000,8,250.000000',
    ].join('\n');
    const { rows } = normalizeNetworkCsvReport({ network: 'mintegral', schemaVer: 1, reportId: 'rep-mt-1', csv });
    expect(rows[0]).toMatchObject({ ad_unit_id: 'unit-7', country: 'IN', paid: 250 });
  });

  it('Pangle: maps ad placement id, country/region, and revenue', () => {
    const csv = [
      'Date,App ID,Ad Placement ID,Country/Region,Ad Type,Currency,Impressions,Clicks,Revenue',
      '2025-11-03,app.pg,adpl-1,BR,interstitial,BRL,220,2,7.500000',
    ].join('\n');
    const { rows } = normalizeNetworkCsvReport({ network: 'pangle', schemaVer: 1, reportId: 'rep-pg-1', csv });
    expect(rows[0]).toMatchObject({ ad_unit_id: 'adpl-1', country: 'BR', paid: 7.5 });
  });

  it('Meta: maps placement id -> ad_unit_id', () => {
    const csv = [
      'Date,App ID,Placement ID,Country,Ad Type,Currency,Impressions,Clicks,Revenue',
      '2025-11-03,app.meta,pl-2,ES,interstitial,EUR,330,3,2.220000',
    ].join('\n');
    const { rows } = normalizeNetworkCsvReport({ network: 'meta', schemaVer: 1, reportId: 'rep-meta-1', csv });
    expect(rows[0]).toMatchObject({ ad_unit_id: 'pl-2', currency: 'EUR', paid: 2.22 });
  });

  it('Moloco: maps bundle id + placement id + reporting currency + estimated revenue', () => {
    const csv = [
      'Date,Bundle ID,Placement ID,Country,Ad Type,Reporting Currency,Impressions,Clicks,Estimated Revenue',
      '2025-11-03,com.moloco,pl-3,GB,interstitial,GBP,410,5,12.000000',
    ].join('\n');
    const { rows } = normalizeNetworkCsvReport({ network: 'moloco', schemaVer: 2, reportId: 'rep-mo-1', csv });
    expect(rows[0]).toMatchObject({ app_id: 'com.moloco', currency: 'GBP', paid: 12, clicks: 5 });
  });

  it('Fyber: maps ad space id and payout', () => {
    const csv = [
      'Day,Package Name,Ad Space ID,Country,Ad Format,Currency,Impressions,Clicks,Payout',
      '2025-11-03,com.fyber,space-1,US,interstitial,USD,100,1,0.990000',
    ].join('\n');
    const { rows } = normalizeNetworkCsvReport({ network: 'fyber', schemaVer: 1, reportId: 'rep-fy-1', csv });
    expect(rows[0]).toMatchObject({ ad_unit_id: 'space-1', paid: 0.99, impressions: 100 });
  });

  it('Smaato: maps ad space id and publisher revenue', () => {
    const csv = [
      'Date,App ID,Ad Space ID,Country,Ad Format,Currency,Impressions,Clicks,Publisher Revenue',
      '2025-11-03,app.smaato,space-9,US,banner,USD,999,0,1.234567',
    ].join('\n');
    const { rows } = normalizeNetworkCsvReport({ network: 'smaato', schemaVer: 1, reportId: 'rep-sm-1', csv });
    expect(rows[0]).toMatchObject({ ad_unit_id: 'space-9', format: 'banner', clicks: 0, paid: 1.234567 });
  });

  it('Tapjoy: maps placement id and earnings', () => {
    const csv = [
      'Date,App ID,Placement ID,Country,Ad Type,Currency,Impressions,Clicks,Earnings',
      '2025-11-03,app.tap,pl-77,US,video,USD,10,0,0.111111',
    ].join('\n');
    const { rows } = normalizeNetworkCsvReport({ network: 'tapjoy', schemaVer: 1, reportId: 'rep-tj-1', csv });
    expect(rows[0]).toMatchObject({ ad_unit_id: 'pl-77', format: 'video', clicks: 0, paid: 0.111111 });
  });

  it('Moloco: maps placement id and revenue', () => {
    const csv = [
      'Date,App ID,Placement ID,Country,Ad Format,Currency,Impressions,Clicks,Revenue',
      '2025-11-03,app.ml,pl-9001,US,interstitial,USD,1,1,0.010000',
    ].join('\n');
    const { rows } = normalizeNetworkCsvReport({ network: 'moloco', schemaVer: 1, reportId: 'rep-ml-1', csv });
    expect(rows[0]).toMatchObject({ ad_unit_id: 'pl-9001', impressions: 1, clicks: 1, paid: 0.01 });
  });
});
