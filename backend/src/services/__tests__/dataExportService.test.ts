import fs from 'fs';
import os from 'os';
import path from 'path';
import type { ExportJob } from '../dataExportService';
import { DataExportService } from '../dataExportService';
import { streamQuery } from '../../utils/postgres';

jest.mock('../../utils/postgres', () => ({
  streamQuery: jest.fn(),
}));

const mockedStreamQuery = streamQuery as jest.MockedFunction<typeof streamQuery>;

const collectAsyncGenerator = async <T>(gen: AsyncGenerator<T>): Promise<T[]> => {
  const results: T[] = [];
  for await (const value of gen) {
    results.push(value);
  }
  return results;
};

const makeAsyncGenerator = <T>(rows: T[]): AsyncGenerator<T> =>
  (async function* generator() {
    for (const row of rows) {
      yield row;
    }
  })();

describe('DataExportService streaming helpers', () => {
  beforeEach(() => {
    mockedStreamQuery.mockReset();
  });

  it('streams impression aggregates from replicas and normalizes values', async () => {
    const service = new DataExportService();
    const from = new Date('2024-01-01T00:00:00Z');
    const to = new Date('2024-01-02T00:00:00Z');
    const rawRows = [
      {
        date: '2024-01-01',
        publisher_id: 'pub-1',
        app_id: null,
        adapter_name: 'ExampleAdapter',
        ad_format: null,
        country: null,
        impressions: '10',
        revenue: '4.2',
        avg_latency: null,
      },
    ];
    mockedStreamQuery.mockReturnValueOnce(makeAsyncGenerator(rawRows));

    const rows = await collectAsyncGenerator(
      (service as any).fetchImpressionExportStream('pub-1', from, to)
    );

    expect(rows).toEqual([
      {
        date: '2024-01-01',
        publisher_id: 'pub-1',
        app_id: '',
        adapter_name: 'ExampleAdapter',
        ad_format: '',
        country: 'ZZ',
        impressions: 10,
        revenue: 4.2,
        avg_latency: 0,
      },
    ]);

    expect(mockedStreamQuery).toHaveBeenCalledWith(
      expect.stringContaining('FROM analytics_impressions'),
      ['pub-1', from, to],
      {
        replica: true,
        label: 'EXPORT_IMPRESSIONS',
        batchSize: (service as any).streamBatchSize,
      }
    );
  });

  it('applies raw export limits and preserves typed fields', async () => {
    const service = new DataExportService();
    const from = new Date('2024-02-01T00:00:00Z');
    const to = new Date('2024-02-02T00:00:00Z');
    const observedAt = new Date('2024-02-01T05:00:00Z');
    const rawRows = [
      {
        id: '1',
        event_id: 'evt',
        observed_at: observedAt,
        publisher_id: 'pub-raw',
        app_id: 'app-1',
        placement_id: null,
        adapter_id: null,
        adapter_name: null,
        ad_unit_id: null,
        ad_format: null,
        country_code: null,
        device_type: null,
        os: null,
        os_version: null,
        session_id: null,
        user_id: null,
        request_id: null,
        status: null,
        filled: true,
        viewable: false,
        measurable: true,
        view_duration_ms: '123',
        latency_ms: '77',
        revenue_usd: '0.55',
        is_test_mode: false,
        meta_json: null,
        created_at: observedAt,
      },
    ];
    mockedStreamQuery.mockReturnValueOnce(makeAsyncGenerator(rawRows));

    const rows = await collectAsyncGenerator(
      (service as any).fetchRawImpressionExportStream('pub-raw', from, to)
    );

    expect(rows[0]).toMatchObject({
      id: '1',
      publisher_id: 'pub-raw',
      view_duration_ms: 123,
      latency_ms: 77,
      revenue_usd: 0.55,
      meta_json: '{}',
    });

    expect(mockedStreamQuery).toHaveBeenCalledWith(
      expect.stringContaining('FROM analytics_impressions'),
      ['pub-raw', from, to, (service as any).maxRawExportRows],
      {
        replica: true,
        label: 'EXPORT_ALL_IMPRESSIONS',
        batchSize: (service as any).streamBatchSize,
      }
    );
  });

  it('writes streamed CSV files without buffering all rows', async () => {
    const originalExportDir = process.env.EXPORT_DIR;
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'export-test-'));
    process.env.EXPORT_DIR = tmpDir;
    const service = new DataExportService();

    const job: ExportJob = {
      id: 'job-test',
      type: 'csv',
      destination: 'local',
      status: 'running',
      publisherId: 'pub-csv',
      dataType: 'impressions',
      startDate: new Date('2024-03-01T00:00:00Z'),
      endDate: new Date('2024-03-02T00:00:00Z'),
      rowsExported: 0,
      fileSize: 0,
      createdAt: new Date(),
    };

    const rows = [
      { date: '2024-03-01', publisher_id: 'pub-csv', impressions: 1 },
      { date: '2024-03-01', publisher_id: 'pub-csv', impressions: 2 },
    ];

    const stream = makeAsyncGenerator(rows);
    const config = {
      format: 'csv',
      compression: 'none',
      destination: { type: 'local' },
    } as const;

    let filePath = '';

    try {
      const result = await (service as any).generateExportFile(job, stream, config);
      filePath = result.filePath;

      expect(result.rowsWritten).toBe(rows.length);
      const contents = fs.readFileSync(filePath, 'utf8').trim().split('\n');
      expect(contents[0]).toBe('date,publisher_id,impressions');
      expect(contents.slice(1)).toEqual([
        '"2024-03-01","pub-csv",1',
        '"2024-03-01","pub-csv",2',
      ]);
    } finally {
      if (filePath && fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      fs.rmSync(tmpDir, { recursive: true, force: true });
      process.env.EXPORT_DIR = originalExportDir;
    }
  });
});
