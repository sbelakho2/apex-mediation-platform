import { parse } from 'csv-parse/sync'
import type { NormalizedMappingRow } from '../services/migrationImportConnectors'

export function parseMigrationCsv(buffer: Buffer): NormalizedMappingRow[] {
  const csv = buffer.toString('utf8')
  if (!csv.trim()) {
    throw new Error('CSV file is empty')
  }

  const records = parse(csv, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as Array<Record<string, string>>

  return records.map((row, index) => {
    const network = row.network || row.Network || row.provider
    const instanceId = row.instance_id || row.instanceId || row.InstanceID

    if (!network || !instanceId) {
      throw new Error(`Missing required columns on row ${index + 1}`)
    }

    const waterfallPosition = row.waterfall_position || row.position || row.rank
    const ecpm = row.ecpm_cents || row.ecpm || row.floor_cents

    return {
      network,
      instanceId,
      instanceName: row.instance_name || row.name || row.Label,
      waterfallPosition: waterfallPosition ? Number(waterfallPosition) : undefined,
      ecpmCents: ecpm ? Number(ecpm) : undefined,
      confidence: 'medium' as const,
    }
  })
}
