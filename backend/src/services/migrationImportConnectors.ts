/**
 * Lightweight connectors for incumbent mediation providers used during Migration Studio imports.
 * In production these would make authenticated API calls; for now we simulate deterministic
 * responses so the import pipeline and tests can exercise the flows end-to-end.
 */

export type ConnectorCredentials = {
  api_key: string
  account_id: string
}

export type NormalizedMappingRow = {
  network: string
  instanceId: string
  instanceName?: string
  waterfallPosition?: number
  ecpmCents?: number
  confidence: 'high' | 'medium' | 'low'
}

function ensureCredentials(source: string, credentials: ConnectorCredentials) {
  if (!credentials?.api_key?.trim() || !credentials?.account_id?.trim()) {
    throw new Error(`${source} credentials are required`)
  }
}

export async function fetchIronSourceSetup(credentials: ConnectorCredentials): Promise<NormalizedMappingRow[]> {
  ensureCredentials('ironSource', credentials)

  // Return deterministic sample data seeded off account id so tests can assert values
  const base = credentials.account_id.slice(-4)
  return [
    {
      network: 'ironSource',
      instanceId: `is-rv-${base}`,
      instanceName: 'ironSource Rewarded',
      waterfallPosition: 1,
      ecpmCents: 275,
      confidence: 'high',
    },
    {
      network: 'ironSource',
      instanceId: `is-int-${base}`,
      instanceName: 'ironSource Interstitial',
      waterfallPosition: 2,
      ecpmCents: 180,
      confidence: 'medium',
    },
  ]
}

export async function fetchAppLovinSetup(credentials: ConnectorCredentials): Promise<NormalizedMappingRow[]> {
  ensureCredentials('AppLovin', credentials)

  const base = credentials.account_id.slice(-3)
  return [
    {
      network: 'AppLovin',
      instanceId: `max-v${base}`,
      instanceName: 'MAX Video',
      waterfallPosition: 1,
      ecpmCents: 320,
      confidence: 'high',
    },
    {
      network: 'AppLovin',
      instanceId: `max-b${base}`,
      instanceName: 'MAX Banner',
      waterfallPosition: 3,
      ecpmCents: 95,
      confidence: 'medium',
    },
  ]
}
