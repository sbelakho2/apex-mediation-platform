import crypto from 'crypto'
import { MigrationStudioService } from '../src/services/migrationStudioService'
import type { MappingConfidence } from '../src/types/migration'

type QueryResult<T = any> = { rows: T[] }

type PlacementRow = { id: string; app_id: string }
type AppRow = { id: string; publisher_id: string }
type ImportRow = {
  id: string
  publisher_id: string
  experiment_id: string | null
  placement_id: string | null
  source: string
  status: string
  summary: any
  created_by: string
  created_at: string
  updated_at: string
  completed_at: string | null
}

class InMemoryDatabase {
  placements: PlacementRow[] = []
  apps: AppRow[] = []
  experiments: any[] = []
  imports: ImportRow[] = []
  mappings: any[] = []
  audit: any[] = []

  async execute(text: string, params: any[] = []): Promise<QueryResult> {
    const sql = text.trim().replace(/\s+/g, ' ')
    if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') {
      return { rows: [] }
    }

    if (sql.startsWith('SELECT p.id FROM placements')) {
      const [placementId, publisherId] = params
      const placement = this.placements.find((p) => p.id === placementId)
      const app = placement ? this.apps.find((a) => a.id === placement.app_id) : null
      if (placement && app && app.publisher_id === publisherId) {
        return { rows: [{ id: placement.id }] }
      }
      return { rows: [] }
    }

    if (sql.startsWith('SELECT * FROM migration_experiments WHERE id = $1 AND publisher_id = $2')) {
      const [experimentId, publisherId] = params
      const row = this.experiments.find((exp) => exp.id === experimentId && exp.publisher_id === publisherId)
      return { rows: row ? [row] : [] }
    }

    if (sql.startsWith('INSERT INTO migration_experiments')) {
      const [publisherId, name, description, placementId, objective, seed, guardrailsJson, createdBy] = params
      const now = new Date().toISOString()
      const experiment = {
        id: `exp_${this.experiments.length + 1}`,
        publisher_id: publisherId,
        name,
        description,
        app_id: null,
        placement_id: placementId,
        objective,
        seed,
        guardrails: guardrailsJson ? JSON.parse(guardrailsJson) : {},
        created_by: createdBy,
        mirror_percent: 0,
        status: 'draft',
        mode: 'shadow',
        created_at: now,
        updated_at: now,
      }
      this.experiments.push(experiment)
      return { rows: [experiment] }
    }

    if (sql.startsWith('INSERT INTO migration_audit')) {
      this.audit.push({ params })
      return { rows: [] }
    }

    if (sql.startsWith('INSERT INTO migration_imports')) {
      const [publisherId, experimentId, placementId, source, createdBy] = params
      const now = new Date().toISOString()
      const importRow: ImportRow = {
        id: `import_${this.imports.length + 1}`,
        publisher_id: publisherId,
        experiment_id: experimentId,
        placement_id: placementId,
        source,
        status: 'pending_review',
        summary: {},
        created_by: createdBy,
        created_at: now,
        updated_at: now,
        completed_at: null,
      }
      this.imports.push(importRow)
      return { rows: [importRow] }
    }

    if (sql.startsWith('INSERT INTO migration_mappings')) {
      const [experimentId, network, instanceId, instanceName, waterfallPosition, ecpmCents, status, confidence, adapterId, adapterName] = params
      const now = new Date().toISOString()
      const mapping: any = {
        id: `map_${this.mappings.length + 1}`,
        experiment_id: experimentId,
        incumbent_network: network,
        incumbent_instance_id: instanceId,
        incumbent_instance_name: instanceName,
        incumbent_waterfall_position: waterfallPosition,
        incumbent_ecpm_cents: ecpmCents,
        mapping_status: status,
        mapping_confidence: confidence as MappingConfidence,
        our_adapter_id: adapterId,
        our_adapter_name: adapterName,
        conflict_reason: null,
        created_at: now,
        updated_at: now,
      }
      const existingIndex = this.mappings.findIndex((row) => row.experiment_id === experimentId && row.incumbent_instance_id === instanceId)
      if (existingIndex >= 0) {
        this.mappings[existingIndex] = { ...this.mappings[existingIndex], ...mapping, updated_at: now }
        return { rows: [this.mappings[existingIndex]] }
      }
      this.mappings.push(mapping)
      return { rows: [mapping] }
    }

    if (sql.startsWith('UPDATE migration_imports SET summary =')) {
      const [summaryJson, importId] = params
      const importRow = this.imports.find((row) => row.id === importId)
      if (!importRow) return { rows: [] }
      importRow.summary = JSON.parse(summaryJson)
      importRow.updated_at = new Date().toISOString()
      return { rows: [importRow] }
    }

    if (sql.startsWith('SELECT id FROM migration_imports WHERE experiment_id = $1')) {
      const [experimentId] = params
      const found = [...this.imports]
        .filter((row) => row.experiment_id === experimentId)
        .sort((a, b) => (a.created_at > b.created_at ? -1 : 1))
      return { rows: found.length > 0 ? [{ id: found[0].id }] : [] }
    }

    if (sql.startsWith('SELECT * FROM migration_imports WHERE id = $1 AND publisher_id = $2')) {
      const [importId, publisherId] = params
      const row = this.imports.find((imp) => imp.id === importId && imp.publisher_id === publisherId)
      return { rows: row ? [row] : [] }
    }

    if (sql.startsWith('SELECT * FROM migration_mappings WHERE experiment_id = $1')) {
      const [experimentId] = params
      const rows = this.mappings.filter((mapping) => mapping.experiment_id === experimentId)
      return { rows }
    }

    if (sql.startsWith('UPDATE migration_imports SET status =')) {
      const [summaryJson, importId] = params
      const importRow = this.imports.find((row) => row.id === importId)
      if (!importRow) return { rows: [] }
      importRow.status = 'completed'
      importRow.summary = JSON.parse(summaryJson)
      importRow.completed_at = new Date().toISOString()
      importRow.updated_at = new Date().toISOString()
      return { rows: [importRow] }
    }

    if (sql.startsWith('UPDATE migration_experiments SET mode =')) {
      const [experimentId] = params
      const experiment = this.experiments.find((exp) => exp.id === experimentId)
      if (experiment) {
        experiment.mode = 'shadow'
        experiment.updated_at = new Date().toISOString()
        experiment.last_guardrail_check = experiment.updated_at
      }
      return { rows: experiment ? [experiment] : [] }
    }

    throw new Error(`Unrecognized SQL in sandbox runner: ${sql}`)
  }
}

class InMemoryClient {
  constructor(private db: InMemoryDatabase) {}
  async query(text: string, params?: any[]): Promise<QueryResult> {
    return this.db.execute(text, params)
  }
  async release(): Promise<void> {
    return
  }
}

class InMemoryPool {
  constructor(private db: InMemoryDatabase) {}
  async connect(): Promise<InMemoryClient> {
    return new InMemoryClient(this.db)
  }
  async query(text: string, params?: any[]): Promise<QueryResult> {
    return this.db.execute(text, params)
  }
}

async function main() {
  const db = new InMemoryDatabase()
  db.apps.push({ id: 'app_sandbox', publisher_id: 'publisher_sandbox' })
  db.placements.push({ id: 'placement_sandbox', app_id: 'app_sandbox' })

  const service = new MigrationStudioService(new InMemoryPool(db) as any)

  const draft = await service.createImport({
    publisherId: 'publisher_sandbox',
    userId: 'user_sandbox',
    placementId: 'placement_sandbox',
    source: 'ironSource',
    credentials: {
      api_key: 'sandbox-api-key',
      account_id: 'sandbox-account-1234',
    },
  })

  console.log('Draft import summary:', JSON.stringify(draft.summary, null, 2))
  console.log('Auto-suggested adapter assignments:', draft.mappings.map((mapping) => ({
    incumbent: mapping.incumbent_instance_id,
    suggested_adapter: mapping.our_adapter_id,
    status: mapping.mapping_status,
    confidence: mapping.mapping_confidence,
  })))

  const finalized = await service.finalizeImport(draft.import.id, 'publisher_sandbox', 'user_sandbox')

  console.log('Finalized summary:', JSON.stringify(finalized.summary, null, 2))
  console.log('Signed comparison metrics:')
  Object.entries(finalized.signedComparison.metrics).forEach(([key, metric]) => {
    console.log(`  ${key}: control=${metric.control} ${metric.unit}, test=${metric.test} ${metric.unit}, uplift=${metric.uplift_percent}%`)
  })

  const payloadBuffer = Buffer.from(finalized.signedComparison.signature.payload_base64, 'base64')
  const signatureBuffer = Buffer.from(finalized.signedComparison.signature.signature_base64, 'base64')
  const publicKeyBuffer = Buffer.from(finalized.signedComparison.signature.public_key_base64, 'base64')

  const verified = crypto.verify(null, payloadBuffer, {
    key: publicKeyBuffer,
    format: 'der',
    type: 'spki',
  }, signatureBuffer)

  console.log('Signature verified with exported public key:', verified)
  console.log('Key ID:', finalized.signedComparison.signature.key_id)
}

if (require.main === module) {
  main().catch((error) => {
    console.error('Sandbox import failed', error)
    process.exitCode = 1
  })
}

export default main