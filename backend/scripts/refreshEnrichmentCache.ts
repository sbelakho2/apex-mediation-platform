#!/usr/bin/env ts-node

import path from 'node:path';
import process from 'node:process';
import logger from '../src/utils/logger';
import { EnrichmentService } from '../src/services/enrichment/enrichmentService';

interface RefreshOptions {
  version?: string;
  baseDir?: string;
  quiet?: boolean;
}

const parseArgs = (): RefreshOptions => {
  const options: RefreshOptions = {};
  for (const raw of process.argv.slice(2)) {
    const [key, value] = raw.split('=');
    switch (key) {
      case '--version':
        options.version = value;
        break;
      case '--baseDir':
        options.baseDir = value;
        break;
      case '--quiet':
        options.quiet = true;
        break;
      default:
        console.warn(`Unknown argument "${raw}" ignored`);
    }
  }
  return options;
};

(async () => {
  const { version, baseDir, quiet } = parseArgs();
  const resolvedBaseDir = baseDir ? path.resolve(process.cwd(), baseDir) : undefined;
  const service = new EnrichmentService(resolvedBaseDir);

  if (!quiet) {
    console.log('[Enrichment] Starting cache refresh...');
    if (resolvedBaseDir) {
      console.log(`[Enrichment] Base directory: ${resolvedBaseDir}`);
    }
    if (version) {
      console.log(`[Enrichment] Target manifest version: ${version}`);
    }
  }

  await service.initialize(version);

  if (!quiet) {
    console.log('[Enrichment] Datasets loaded successfully');
    console.log(`[Enrichment] Snapshot written to: ${service.getSnapshotPath()}`);
  }

  logger.info('Enrichment cache refresh complete', {
    version: version ?? 'latest',
    baseDir: resolvedBaseDir ?? '(default)',
    snapshotPath: service.getSnapshotPath(),
  });

  process.exit(0);
})().catch((error) => {
  console.error('[Enrichment] Refresh failed:', error);
  logger.error('Enrichment cache refresh failed', { error });
  process.exit(1);
});
