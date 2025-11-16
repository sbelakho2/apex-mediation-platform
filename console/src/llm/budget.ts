// Budget metering with per-tenant persistence and storage-backed guardrails for LLM autonomy flows.

import { type ProviderName, type PricingPerThousandTokens } from './types'

export interface BudgetCaps {
  monthlyUSD: number // hard cap
  dailyUSD: number // soft/hard daily limit
}

export interface BudgetScope {
  tenantId: string
  userId: string
  sessionId?: string
}

export interface BudgetUsageEntry {
  provider: ProviderName
  tokensIn: number
  tokensOut: number
  costUSD?: number
}

export interface SpendSnapshot {
  monthToDateUSD: number
  dayToDateUSD: number
  alerts: string[]
  hardStop: boolean
}

interface PersistedBudgetState {
  monthToDateUSD: number
  dayToDateUSD: number
  updatedAt: string
}

type PricingLookup = (provider: ProviderName) => PricingPerThousandTokens | undefined

export interface BudgetStorage {
  read(key: string): PersistedBudgetState | null
  write(key: string, state: PersistedBudgetState): void
  subscribe?(key: string, handler: (state: PersistedBudgetState | null) => void): () => void
}

export class InMemoryBudgetStorage implements BudgetStorage {
  private store = new Map<string, PersistedBudgetState>()
  private listeners = new Map<string, Set<(state: PersistedBudgetState | null) => void>>()

  read(key: string): PersistedBudgetState | null {
    const value = this.store.get(key)
    return value ? cloneState(value) : null
  }

  write(key: string, state: PersistedBudgetState): void {
    this.store.set(key, cloneState(state))
    this.listeners.get(key)?.forEach((cb) => cb(cloneState(state)))
  }

  subscribe(key: string, handler: (state: PersistedBudgetState | null) => void) {
    const listeners = this.listeners.get(key) ?? new Set()
    listeners.add(handler)
    this.listeners.set(key, listeners)
    return () => {
      listeners.delete(handler)
      if (listeners.size === 0) this.listeners.delete(key)
    }
  }
}

class LocalBudgetStorage implements BudgetStorage {
  constructor(private storage: Storage) {}

  read(key: string): PersistedBudgetState | null {
    try {
      const raw = this.storage.getItem(key)
      return raw ? (JSON.parse(raw) as PersistedBudgetState) : null
    } catch {
      return null
    }
  }

  write(key: string, state: PersistedBudgetState): void {
    try {
      this.storage.setItem(key, JSON.stringify(state))
    } catch {
      // no-op
    }
  }

  subscribe(key: string, handler: (state: PersistedBudgetState | null) => void) {
    if (typeof window === 'undefined') return () => {}
    const listener = (event: StorageEvent) => {
      if (event.key !== key) return
      if (event.newValue) {
        try {
          handler(JSON.parse(event.newValue) as PersistedBudgetState)
        } catch {
          handler(null)
        }
      } else {
        handler(null)
      }
    }
    window.addEventListener('storage', listener)
    return () => window.removeEventListener('storage', listener)
  }
}

export interface BudgetMeterOptions {
  storage?: BudgetStorage
  pricing?: Partial<Record<ProviderName, PricingPerThousandTokens>> | PricingLookup
  now?: () => Date
}

export class BudgetMeter {
  private state: PersistedBudgetState
  private readonly storage: BudgetStorage
  private readonly pricing: PricingLookup
  private readonly key: string
  private readonly now: () => Date
  private pending: Promise<void> = Promise.resolve()
  private unsubscribe?: () => void

  constructor(private caps: BudgetCaps, private scope: BudgetScope, options: BudgetMeterOptions = {}) {
    this.storage = options.storage ?? getDefaultStorage()
    this.pricing = resolvePricingLookup(options.pricing)
    this.key = buildStorageKey(scope)
    this.now = options.now ?? (() => new Date())

    const initial = this.storage.read(this.key)
    const normalized = this.normalizeState(initial ?? createEmptyState(this.now()), this.now())
    this.state = normalized
    if (!initial) {
      this.persistState(normalized)
    }

    if (this.storage.subscribe) {
      this.unsubscribe = this.storage.subscribe(this.key, (incoming) => {
        if (!incoming) return
        this.state = this.normalizeState(incoming, this.now())
      })
    }
  }

  async recordUsage(entry: BudgetUsageEntry, at = this.now()): Promise<SpendSnapshot> {
    const computedCost = sanitizeCost(entry.costUSD ?? this.estimateCost(entry))
    return this.enqueue(() => this.applyCost(computedCost, at))
  }

  async record(costUSD: number, at = this.now()): Promise<SpendSnapshot> {
    return this.enqueue(() => this.applyCost(sanitizeCost(costUSD), at))
  }

  async resetDay(at = this.now()): Promise<SpendSnapshot> {
    return this.enqueue(() => {
      const state = this.loadFreshState(at)
      state.dayToDateUSD = 0
      this.state = state
      this.persistState(state)
      return this.buildSnapshot(state)
    })
  }

  snapshot(at = this.now()): SpendSnapshot {
    const normalized = this.normalizeState(this.state, at)
    this.state = normalized
    this.persistState(normalized)
    return this.buildSnapshot(normalized)
  }

  dispose() {
    this.unsubscribe?.()
  }

  private applyCost(costUSD: number, at: Date): SpendSnapshot {
    const state = this.loadFreshState(at)
    state.monthToDateUSD = round2(state.monthToDateUSD + costUSD)
    state.dayToDateUSD = round2(state.dayToDateUSD + costUSD)
    this.state = state
    this.persistState(state)
    return this.buildSnapshot(state)
  }

  private loadFreshState(at: Date): PersistedBudgetState {
    const persisted = this.storage.read(this.key)
    if (persisted) {
      return this.normalizeState(persisted, at)
    }
    return this.normalizeState(this.state ?? createEmptyState(at), at)
  }

  private enqueue<T>(fn: () => T | Promise<T>): Promise<T> {
    const run = this.pending.then(() => fn())
    this.pending = run.then(() => undefined, () => undefined)
    return run
  }

  private estimateCost(entry: BudgetUsageEntry): number {
    const pricing = this.pricing(entry.provider) ?? DEFAULT_PRICING[entry.provider] ?? DEFAULT_PRICING.chatgpt
    const tokensInCost = (entry.tokensIn / 1000) * pricing.inputUSD
    const tokensOutCost = (entry.tokensOut / 1000) * pricing.outputUSD
    return round4(tokensInCost + tokensOutCost)
  }

  private buildSnapshot(state: PersistedBudgetState): SpendSnapshot {
    const alerts = computeAlerts(state, this.caps)
    const hardStop = state.monthToDateUSD >= this.caps.monthlyUSD || state.dayToDateUSD >= this.caps.dailyUSD
    return {
      monthToDateUSD: round2(state.monthToDateUSD),
      dayToDateUSD: round2(state.dayToDateUSD),
      alerts,
      hardStop,
    }
  }

  private normalizeState(state: PersistedBudgetState, now: Date): PersistedBudgetState {
    const next = cloneState(state)
    const last = safeDate(state.updatedAt) ?? now
    if (!isSameMonth(last, now)) {
      next.monthToDateUSD = 0
    }
    if (!isSameDay(last, now)) {
      next.dayToDateUSD = 0
    }
    next.updatedAt = now.toISOString()
    return next
  }

  private persistState(state: PersistedBudgetState) {
    this.storage.write(this.key, state)
  }
}

const DEFAULT_PRICING: Record<ProviderName, PricingPerThousandTokens> = {
  chatgpt: { inputUSD: 0.005, outputUSD: 0.015 },
  junie: { inputUSD: 0.003, outputUSD: 0.009 },
}

function getDefaultStorage(): BudgetStorage {
  const storage = resolveLocalStorage()
  if (storage) {
    return new LocalBudgetStorage(storage)
  }
  return new InMemoryBudgetStorage()
}

function resolvePricingLookup(source?: BudgetMeterOptions['pricing']): PricingLookup {
  if (!source) {
    return (provider) => DEFAULT_PRICING[provider]
  }
  if (typeof source === 'function') {
    return source
  }
  const table = source
  return (provider) => table?.[provider]
}

function computeAlerts(state: PersistedBudgetState, caps: BudgetCaps): string[] {
  const alerts: string[] = []
  const thresholds = [0.5, 0.75, 0.9, 1.0]
  const monthlyCap = Math.max(caps.monthlyUSD, 0.01)
  const ratio = state.monthToDateUSD / monthlyCap
  for (const threshold of thresholds) {
    if (ratio >= threshold) alerts.push(`monthly_${Math.round(threshold * 100)}pct`)
  }

  const dayRatio = caps.dailyUSD > 0 ? state.dayToDateUSD / caps.dailyUSD : 0
  if (dayRatio >= 1) alerts.push('daily_100pct')
  else if (dayRatio >= 0.9) alerts.push('daily_90pct')

  return alerts
}

function createEmptyState(now: Date): PersistedBudgetState {
  return {
    monthToDateUSD: 0,
    dayToDateUSD: 0,
    updatedAt: now.toISOString(),
  }
}

function cloneState(state: PersistedBudgetState): PersistedBudgetState {
  return { ...state }
}

function round2(n: number) {
  return Math.round(n * 100) / 100
}

function round4(n: number) {
  return Math.round(n * 10_000) / 10_000
}

function sanitizeCost(costUSD: number) {
  if (!Number.isFinite(costUSD) || costUSD < 0) return 0
  return round4(costUSD)
}

function buildStorageKey(scope: BudgetScope) {
  const sessionPart = scope.sessionId ? `:${scope.sessionId}` : ''
  return `llm_budget:${scope.tenantId}:${scope.userId}${sessionPart}`
}

function resolveLocalStorage(): Storage | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null
    return window.localStorage
  } catch {
    return null
  }
}

function safeDate(value?: string) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function isSameDay(a: Date, b: Date) {
  return a.getUTCFullYear() === b.getUTCFullYear() && a.getUTCMonth() === b.getUTCMonth() && a.getUTCDate() === b.getUTCDate()
}

function isSameMonth(a: Date, b: Date) {
  return a.getUTCFullYear() === b.getUTCFullYear() && a.getUTCMonth() === b.getUTCMonth()
}
