'use client'

import { useState, useCallback, useMemo } from 'react'
import {
  Upload,
  Play,
  Download,
  AlertTriangle,
  CheckCircle2,
  Info,
  X,
  FileJson,
  Settings2,
  BarChart3,
  Clock,
} from 'lucide-react'

/**
 * Types for imported mediation platform configurations
 */
interface ImportedPlacement {
  placementId: string
  adFormat: 'banner' | 'interstitial' | 'rewarded' | 'native' | 'mrec'
  floor?: number
  dailyCap?: number
  hourlyCap?: number
  pacingIntervalMs?: number
  networks: string[]
  waterfall?: Array<{
    network: string
    priority: number
    ecpm?: number
  }>
}

interface ImportedConfig {
  platform: 'unity' | 'max' | 'ironsource' | 'custom'
  appId: string
  placements: ImportedPlacement[]
  globalSettings?: {
    testMode?: boolean
    gdprApplies?: boolean
    ccpaApplies?: boolean
    coppaApplies?: boolean
  }
}

interface SimulationResult {
  placementId: string
  simulatedImpressions: number
  cappedImpressions: number
  cappingRate: number
  pacedImpressions: number
  pacingRate: number
  floorFiltered: number
  floorFilterRate: number
  projectedRevenue: number
  projectedRevenueChange: number
  warnings: string[]
}

interface ApexConfig {
  appId: string
  version: number
  placements: Record<string, {
    placementId: string
    adFormat: string
    floor: number
    dailyCap: number
    hourlyCap: number
    pacingEnabled: boolean
    pacingIntervalMs: number
    networks: string[]
  }>
  features: {
    bidding: boolean
    waterfall: boolean
    bannerRefresh: boolean
    bannerRefreshIntervalMs: number
  }
  compliance: {
    gdprApplies: boolean
    ccpaApplies: boolean
    coppaApplies: boolean
  }
}

interface ParitySimulatorProps {
  placementId: string
  onClose: () => void
  onExport?: (config: ApexConfig) => void
}

/**
 * Network name mapping from various SDKs to Apex adapters
 */
const NETWORK_MAPPING: Record<string, string> = {
  // Unity/MAX names
  admob: 'admob',
  applovin: 'applovin',
  ironsource: 'ironsource',
  unity: 'unity',
  vungle: 'vungle',
  chartboost: 'chartboost',
  pangle: 'pangle',
  mintegral: 'mintegral',
  inmobi: 'inmobi',
  meta: 'facebook',
  facebook: 'facebook',
  bidmachine: 'bidmachine',
  amazon: 'amazon',
  fyber: 'fyber',
  smaato: 'smaato',
  tapjoy: 'tapjoy',
  adcolony: 'adcolony',
  
  // ironSource specific names
  is_adapter_admob: 'admob',
  is_adapter_applovin: 'applovin',
  is_adapter_facebook: 'facebook',
  is_adapter_unityads: 'unity',
  is_adapter_vungle: 'vungle',
  is_adapter_chartboost: 'chartboost',
  is_adapter_pangle: 'pangle',
  is_adapter_inmobi: 'inmobi',
  
  // MAX specific names
  ADMOB_NETWORK: 'admob',
  APPLOVIN_NETWORK: 'applovin',
  FACEBOOK_NETWORK: 'facebook',
  IRONSOURCE_NETWORK: 'ironsource',
  UNITY_NETWORK: 'unity',
  VUNGLE_NETWORK: 'vungle',
  CHARTBOOST_NETWORK: 'chartboost',
}

function normalizeNetworkName(network: string): string {
  const lower = network.toLowerCase().replace(/[_-]/g, '')
  return NETWORK_MAPPING[network] || NETWORK_MAPPING[lower] || network.toLowerCase()
}

function parseUnityConfig(json: Record<string, unknown>): ImportedConfig | null {
  try {
    const placements: ImportedPlacement[] = []
    const config = json as {
      appId?: string
      placements?: Array<{
        placementId: string
        adType?: string
        floor?: number
        cap?: { daily?: number; hourly?: number }
        pacing?: { intervalMs?: number }
        adapters?: string[]
      }>
    }
    
    if (config.placements) {
      for (const p of config.placements) {
        placements.push({
          placementId: p.placementId,
          adFormat: (p.adType as ImportedPlacement['adFormat']) || 'interstitial',
          floor: p.floor,
          dailyCap: p.cap?.daily,
          hourlyCap: p.cap?.hourly,
          pacingIntervalMs: p.pacing?.intervalMs,
          networks: (p.adapters || []).map(normalizeNetworkName),
        })
      }
    }
    
    return {
      platform: 'unity',
      appId: config.appId || 'imported-unity-app',
      placements,
    }
  } catch {
    return null
  }
}

function parseMaxConfig(json: Record<string, unknown>): ImportedConfig | null {
  try {
    const placements: ImportedPlacement[] = []
    const config = json as {
      sdkKey?: string
      adUnits?: Array<{
        adUnitId: string
        format?: string
        cpmFloor?: number
        frequencyCapSettings?: { maxAds?: number; capWindowHours?: number }
        waterfall?: Array<{ networkName: string; cpmBid?: number }>
      }>
    }
    
    if (config.adUnits) {
      for (const unit of config.adUnits) {
        const networks = (unit.waterfall || []).map(w => normalizeNetworkName(w.networkName))
        placements.push({
          placementId: unit.adUnitId,
          adFormat: (unit.format?.toLowerCase() as ImportedPlacement['adFormat']) || 'interstitial',
          floor: unit.cpmFloor,
          dailyCap: unit.frequencyCapSettings?.maxAds,
          networks,
          waterfall: unit.waterfall?.map((w, i) => ({
            network: normalizeNetworkName(w.networkName),
            priority: i + 1,
            ecpm: w.cpmBid,
          })),
        })
      }
    }
    
    return {
      platform: 'max',
      appId: config.sdkKey || 'imported-max-app',
      placements,
    }
  } catch {
    return null
  }
}

function parseIronSourceConfig(json: Record<string, unknown>): ImportedConfig | null {
  try {
    const placements: ImportedPlacement[] = []
    const config = json as {
      appKey?: string
      placements?: Array<{
        placementName: string
        adFormat?: string
        rewardedVideoFloor?: number
        interstitialCapping?: number
        pacing?: number
        adapterConfigs?: Array<{ providerName: string }>
      }>
    }
    
    if (config.placements) {
      for (const p of config.placements) {
        const networks = (p.adapterConfigs || []).map(a => normalizeNetworkName(a.providerName))
        placements.push({
          placementId: p.placementName,
          adFormat: (p.adFormat?.toLowerCase() as ImportedPlacement['adFormat']) || 'rewarded',
          floor: p.rewardedVideoFloor,
          dailyCap: p.interstitialCapping,
          pacingIntervalMs: p.pacing ? p.pacing * 1000 : undefined,
          networks,
        })
      }
    }
    
    return {
      platform: 'ironsource',
      appId: config.appKey || 'imported-ironsource-app',
      placements,
    }
  } catch {
    return null
  }
}

function detectAndParseConfig(json: Record<string, unknown>): ImportedConfig | null {
  // Try to detect platform based on JSON structure
  if ('sdkKey' in json || 'adUnits' in json) {
    return parseMaxConfig(json)
  }
  if ('appKey' in json || ('placements' in json && Array.isArray((json as any).placements) && (json as any).placements[0]?.placementName)) {
    return parseIronSourceConfig(json)
  }
  if ('appId' in json || 'placements' in json) {
    return parseUnityConfig(json)
  }
  // Try each parser
  return parseUnityConfig(json) || parseMaxConfig(json) || parseIronSourceConfig(json)
}

function simulatePlacement(
  placement: ImportedPlacement,
  dailyImpressions: number = 10000
): SimulationResult {
  const warnings: string[] = []
  let cappedImpressions = 0
  let pacedImpressions = 0
  let floorFiltered = 0
  
  // Simulate daily capping
  if (placement.dailyCap && placement.dailyCap > 0) {
    const excess = Math.max(0, dailyImpressions - placement.dailyCap)
    cappedImpressions += excess
    if (excess > 0) {
      warnings.push(`Daily cap of ${placement.dailyCap} would block ${excess.toLocaleString()} impressions`)
    }
  }
  
  // Simulate hourly capping (rough estimate: 1/24 of daily)
  if (placement.hourlyCap && placement.hourlyCap > 0) {
    const hourlyImpressions = dailyImpressions / 24
    const hourlyExcess = Math.max(0, hourlyImpressions - placement.hourlyCap) * 24
    cappedImpressions = Math.max(cappedImpressions, hourlyExcess)
  }
  
  // Simulate pacing
  if (placement.pacingIntervalMs && placement.pacingIntervalMs > 0) {
    // Estimate ~30 second average user session with multiple ad requests
    const avgSessionLengthMs = 30000
    const requestsPerSession = avgSessionLengthMs / placement.pacingIntervalMs
    if (requestsPerSession < 1) {
      pacedImpressions = dailyImpressions * 0.3 // Aggressive pacing blocks ~30%
      warnings.push(`Pacing interval of ${placement.pacingIntervalMs}ms may significantly reduce fill`)
    }
  }
  
  // Simulate floor filtering
  if (placement.floor && placement.floor > 0) {
    // Higher floors filter more bids - rough estimate
    const filterRate = Math.min(0.5, placement.floor / 20) // $20 CPM = 50% filter rate
    floorFiltered = Math.round(dailyImpressions * filterRate)
    if (filterRate > 0.2) {
      warnings.push(`Floor of $${placement.floor.toFixed(2)} may filter ${(filterRate * 100).toFixed(0)}% of bids`)
    }
  }
  
  const effectiveImpressions = dailyImpressions - cappedImpressions - pacedImpressions - floorFiltered
  const avgEcpm = placement.floor ? Math.max(placement.floor * 1.2, 2) : 5 // Rough eCPM estimate
  const projectedRevenue = (effectiveImpressions / 1000) * avgEcpm
  const baselineRevenue = (dailyImpressions / 1000) * 5
  const projectedRevenueChange = ((projectedRevenue - baselineRevenue) / baselineRevenue) * 100
  
  return {
    placementId: placement.placementId,
    simulatedImpressions: dailyImpressions,
    cappedImpressions,
    cappingRate: (cappedImpressions / dailyImpressions) * 100,
    pacedImpressions,
    pacingRate: (pacedImpressions / dailyImpressions) * 100,
    floorFiltered,
    floorFilterRate: (floorFiltered / dailyImpressions) * 100,
    projectedRevenue,
    projectedRevenueChange,
    warnings,
  }
}

function convertToApexConfig(imported: ImportedConfig): ApexConfig {
  const placements: ApexConfig['placements'] = {}
  
  for (const p of imported.placements) {
    placements[p.placementId] = {
      placementId: p.placementId,
      adFormat: p.adFormat,
      floor: p.floor || 0,
      dailyCap: p.dailyCap || 0,
      hourlyCap: p.hourlyCap || 0,
      pacingEnabled: Boolean(p.pacingIntervalMs && p.pacingIntervalMs > 0),
      pacingIntervalMs: p.pacingIntervalMs || 0,
      networks: p.networks,
    }
  }
  
  return {
    appId: imported.appId,
    version: 1,
    placements,
    features: {
      bidding: true,
      waterfall: true,
      bannerRefresh: false,
      bannerRefreshIntervalMs: 0,
    },
    compliance: {
      gdprApplies: imported.globalSettings?.gdprApplies || false,
      ccpaApplies: imported.globalSettings?.ccpaApplies || false,
      coppaApplies: imported.globalSettings?.coppaApplies || false,
    },
  }
}

export default function ParitySimulator({ placementId, onClose, onExport }: ParitySimulatorProps) {
  const [step, setStep] = useState<'upload' | 'configure' | 'results'>('upload')
  const [importedConfig, setImportedConfig] = useState<ImportedConfig | null>(null)
  const [simulationResults, setSimulationResults] = useState<SimulationResult[]>([])
  const [dailyImpressions, setDailyImpressions] = useState(10000)
  const [jsonError, setJsonError] = useState<string | null>(null)
  const [isDryRun] = useState(true) // Always dry-run mode
  
  const handleFileUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const json = JSON.parse(e.target?.result as string)
        const parsed = detectAndParseConfig(json)
        if (parsed) {
          setImportedConfig(parsed)
          setJsonError(null)
          setStep('configure')
        } else {
          setJsonError('Could not parse configuration. Please ensure it is a valid Unity, MAX, or ironSource config.')
        }
      } catch {
        setJsonError('Invalid JSON file')
      }
    }
    reader.readAsText(file)
  }, [])
  
  const handlePasteJson = useCallback((event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = event.target.value.trim()
    if (!text) {
      setJsonError(null)
      return
    }
    
    try {
      const json = JSON.parse(text)
      const parsed = detectAndParseConfig(json)
      if (parsed) {
        setImportedConfig(parsed)
        setJsonError(null)
      } else {
        setJsonError('Could not detect configuration format')
      }
    } catch {
      setJsonError('Invalid JSON')
    }
  }, [])
  
  const runSimulation = useCallback(() => {
    if (!importedConfig) return
    
    const results = importedConfig.placements.map(p => 
      simulatePlacement(p, dailyImpressions)
    )
    setSimulationResults(results)
    setStep('results')
  }, [importedConfig, dailyImpressions])
  
  const exportConfig = useCallback(() => {
    if (!importedConfig) return
    
    const apexConfig = convertToApexConfig(importedConfig)
    
    // Download as JSON
    const blob = new Blob([JSON.stringify(apexConfig, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `apex-config-${importedConfig.appId}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    
    onExport?.(apexConfig)
  }, [importedConfig, onExport])
  
  const totalWarnings = useMemo(() => 
    simulationResults.reduce((acc, r) => acc + r.warnings.length, 0),
    [simulationResults]
  )
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary-50 text-primary-600 flex items-center justify-center">
              <Settings2 className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Parity Simulator</h2>
              <p className="text-sm text-gray-500">
                Import, simulate, and export configurations
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>
        
        {/* Dry-run banner */}
        {isDryRun && (
          <div className="bg-amber-50 border-b border-amber-200 px-6 py-2 flex items-center gap-2">
            <Info className="h-4 w-4 text-amber-600" />
            <span className="text-sm text-amber-700">
              <strong>Dry-run mode:</strong> No changes will be applied. This is a simulation only.
            </span>
          </div>
        )}
        
        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {step === 'upload' && (
            <div className="space-y-6">
              <div className="text-center">
                <FileJson className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  Import Configuration
                </h3>
                <p className="text-sm text-gray-500 max-w-md mx-auto">
                  Upload a Unity Ads, AppLovin MAX, or ironSource configuration file to simulate parity with Apex.
                </p>
              </div>
              
              {/* File upload */}
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-primary-400 transition-colors">
                <input
                  type="file"
                  accept=".json"
                  onChange={handleFileUpload}
                  className="hidden"
                  id="config-upload"
                />
                <label htmlFor="config-upload" className="cursor-pointer">
                  <Upload className="h-8 w-8 text-gray-400 mx-auto mb-3" />
                  <p className="text-sm font-medium text-gray-700">
                    Click to upload or drag and drop
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    JSON configuration file
                  </p>
                </label>
              </div>
              
              {/* Or paste JSON */}
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-200" />
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="bg-white px-2 text-gray-500">or paste JSON</span>
                </div>
              </div>
              
              <textarea
                onChange={handlePasteJson}
                placeholder='{"appId": "...", "placements": [...]}'
                className="w-full h-40 p-4 font-mono text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
              
              {jsonError && (
                <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 p-3 rounded-lg">
                  <AlertTriangle className="h-4 w-4" />
                  {jsonError}
                </div>
              )}
              
              {importedConfig && (
                <div className="flex items-center gap-2 text-sm text-green-600 bg-green-50 p-3 rounded-lg">
                  <CheckCircle2 className="h-4 w-4" />
                  Detected {importedConfig.platform.toUpperCase()} configuration with {importedConfig.placements.length} placement(s)
                </div>
              )}
            </div>
          )}
          
          {step === 'configure' && importedConfig && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-4">
                  Configure Simulation
                </h3>
                
                <div className="bg-gray-50 rounded-lg p-4 mb-6">
                  <p className="text-sm text-gray-600 mb-2">
                    <strong>Platform:</strong> {importedConfig.platform.toUpperCase()}
                  </p>
                  <p className="text-sm text-gray-600 mb-2">
                    <strong>App ID:</strong> {importedConfig.appId}
                  </p>
                  <p className="text-sm text-gray-600">
                    <strong>Placements:</strong> {importedConfig.placements.length}
                  </p>
                </div>
                
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Daily impressions (per placement)
                </label>
                <input
                  type="number"
                  value={dailyImpressions}
                  onChange={(e) => setDailyImpressions(Math.max(100, parseInt(e.target.value) || 10000))}
                  min={100}
                  step={1000}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                />
              </div>
              
              <div>
                <h4 className="text-sm font-medium text-gray-700 mb-3">
                  Placements to simulate
                </h4>
                <div className="space-y-3">
                  {importedConfig.placements.map((p) => (
                    <div key={p.placementId} className="flex items-center justify-between p-3 bg-white border border-gray-200 rounded-lg">
                      <div>
                        <p className="font-medium text-gray-900">{p.placementId}</p>
                        <p className="text-sm text-gray-500">
                          {p.adFormat} • {p.networks.length} network(s)
                          {p.floor ? ` • $${p.floor.toFixed(2)} floor` : ''}
                          {p.dailyCap ? ` • ${p.dailyCap}/day cap` : ''}
                        </p>
                      </div>
                      <CheckCircle2 className="h-5 w-5 text-green-500" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
          
          {step === 'results' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-medium text-gray-900">
                  Simulation Results
                </h3>
                {totalWarnings > 0 && (
                  <span className="flex items-center gap-1 text-sm text-amber-600">
                    <AlertTriangle className="h-4 w-4" />
                    {totalWarnings} warning(s)
                  </span>
                )}
              </div>
              
              <div className="space-y-4">
                {simulationResults.map((result) => (
                  <div key={result.placementId} className="border border-gray-200 rounded-lg overflow-hidden">
                    <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
                      <h4 className="font-medium text-gray-900">{result.placementId}</h4>
                    </div>
                    <div className="p-4">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                        <div className="text-center p-3 bg-gray-50 rounded-lg">
                          <BarChart3 className="h-5 w-5 text-gray-400 mx-auto mb-1" />
                          <p className="text-lg font-semibold text-gray-900">
                            {result.simulatedImpressions.toLocaleString()}
                          </p>
                          <p className="text-xs text-gray-500">Total impressions</p>
                        </div>
                        <div className="text-center p-3 bg-gray-50 rounded-lg">
                          <Clock className="h-5 w-5 text-gray-400 mx-auto mb-1" />
                          <p className="text-lg font-semibold text-gray-900">
                            {result.cappingRate.toFixed(1)}%
                          </p>
                          <p className="text-xs text-gray-500">Capping rate</p>
                        </div>
                        <div className="text-center p-3 bg-gray-50 rounded-lg">
                          <Settings2 className="h-5 w-5 text-gray-400 mx-auto mb-1" />
                          <p className="text-lg font-semibold text-gray-900">
                            {result.floorFilterRate.toFixed(1)}%
                          </p>
                          <p className="text-xs text-gray-500">Floor filtered</p>
                        </div>
                        <div className="text-center p-3 bg-gray-50 rounded-lg">
                          <BarChart3 className="h-5 w-5 text-gray-400 mx-auto mb-1" />
                          <p className={`text-lg font-semibold ${result.projectedRevenueChange >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {result.projectedRevenueChange >= 0 ? '+' : ''}{result.projectedRevenueChange.toFixed(1)}%
                          </p>
                          <p className="text-xs text-gray-500">Revenue change</p>
                        </div>
                      </div>
                      
                      {result.warnings.length > 0 && (
                        <div className="space-y-2">
                          {result.warnings.map((warning, i) => (
                            <div key={i} className="flex items-start gap-2 text-sm text-amber-700 bg-amber-50 p-2 rounded">
                              <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                              {warning}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        
        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t bg-gray-50">
          <div className="text-sm text-gray-500">
            {step === 'results' && importedConfig && (
              <span>
                Simulated {importedConfig.placements.length} placement(s) with {dailyImpressions.toLocaleString()} daily impressions each
              </span>
            )}
          </div>
          <div className="flex gap-3">
            {step === 'configure' && (
              <>
                <button
                  onClick={() => setStep('upload')}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Back
                </button>
                <button
                  onClick={runSimulation}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700"
                >
                  <Play className="h-4 w-4" />
                  Run Simulation
                </button>
              </>
            )}
            {step === 'results' && (
              <>
                <button
                  onClick={() => setStep('configure')}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Back
                </button>
                <button
                  onClick={exportConfig}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700"
                >
                  <Download className="h-4 w-4" />
                  Export Apex Config
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
