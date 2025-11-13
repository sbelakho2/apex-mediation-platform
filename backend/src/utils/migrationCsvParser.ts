import { parse } from 'csv-parse/sync'
import type { NormalizedMappingRow } from '../services/migrationImportConnectors'

type ColumnKey = keyof Pick<NormalizedMappingRow, 'network' | 'instanceId' | 'instanceName' | 'waterfallPosition' | 'ecpmCents'>

const COLUMN_ALIASES: Record<ColumnKey, string[]> = {
  network: ['network', 'Network', 'provider', 'Provider', 'Network Name'],
  instanceId: ['instance_id', 'instanceId', 'InstanceID', 'instance id', 'Placement Instance ID'],
  instanceName: ['instance_name', 'InstanceName', 'name', 'Name', 'Label', 'Ad Unit Name'],
  waterfallPosition: ['waterfall_position', 'position', 'Position', 'rank', 'Rank', 'placement_priority'],
  ecpmCents: ['ecpm_cents', 'eCPM (cents)', 'ecpm', 'eCPM', 'floor_cents', 'floor', 'Floor (cents)'],
}

const HIGH_CONFIDENCE_NETWORKS = ['ironSource', 'AppLovin', 'MAX', 'UnityAds']

function resolveColumn(row: Record<string, string>, candidateKeys: string[]): string | undefined {
  for (const key of candidateKeys) {
    if (Object.prototype.hasOwnProperty.call(row, key) && row[key]?.toString().trim()) {
      return row[key].toString().trim()
    }
  }
  return undefined
}

function coerceNumber(value: string | undefined, field: string, rowIndex: number): number | undefined {
  if (value === undefined || value === '') return undefined
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid numeric value for ${field} on row ${rowIndex}`)
  }
  return parsed
}

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

  if (records.length === 0) {
    throw new Error('CSV has headers but no data rows')
  }

  return records.map((rawRow, index) => {
    const rowNumber = index + 2 // account for header row when surfacing errors

    const network = resolveColumn(rawRow, COLUMN_ALIASES.network)
    const instanceId = resolveColumn(rawRow, COLUMN_ALIASES.instanceId)

    if (!network || !instanceId) {
      throw new Error(`Missing required columns on row ${rowNumber}: expected network and instance identifier`)
    }

    const instanceName = resolveColumn(rawRow, COLUMN_ALIASES.instanceName)
    const waterfallPositionRaw = resolveColumn(rawRow, COLUMN_ALIASES.waterfallPosition)
    const ecpmRaw = resolveColumn(rawRow, COLUMN_ALIASES.ecpmCents)

    const waterfallPosition = coerceNumber(waterfallPositionRaw, 'waterfall position', rowNumber)
    const ecpmCents = coerceNumber(ecpmRaw, 'eCPM (cents)', rowNumber)

    const normalizedNetwork = network.replace(/_/g, ' ')
    const confidence = HIGH_CONFIDENCE_NETWORKS.some((candidate) =>
      normalizedNetwork.toLowerCase().includes(candidate.toLowerCase())
    )
      ? ('high' as const)
      : ('medium' as const)

    return {
      network: network,
      instanceId,
      instanceName,
      waterfallPosition,
      ecpmCents,
      confidence,
    }
  })
}
