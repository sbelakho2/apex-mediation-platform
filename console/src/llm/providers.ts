'use server'

// LLM provider abstraction with cost-aware routing and rate-limit-aware HTTP providers.

import { ProviderName, type PricingPerThousandTokens } from './types'

export type { ProviderName } from './types'

export interface LLMRequest {
  model?: string
  prompt: string
  maxTokens?: number
  temperature?: number
  signal?: AbortSignal
}

export interface LLMResponse {
  text: string
  tokensIn: number
  tokensOut: number
  estimatedCostUSD: number
  provider: ProviderName
  latencyMs?: number
}

export interface LLMProvider {
  name: ProviderName
  complete(req: LLMRequest): Promise<LLMResponse>
  pricingPer1k: PricingPerThousandTokens
}

export class ProviderError extends Error {
  constructor(message: string, public status?: number) {
    super(message)
    this.name = 'ProviderError'
  }
}

export class RateLimitError extends ProviderError {
  constructor(message = 'Rate limit exceeded', status = 429) {
    super(message, status)
    this.name = 'RateLimitError'
  }
}

type HttpProviderConfig = {
  name: ProviderName
  endpoint: string
  target?: ProviderName
  defaultModel: string
  defaultMaxTokens: number
  defaultTemperature: number
  pricingPer1k: PricingPerThousandTokens
  maxConcurrency?: number
  requestsPerMinute?: number
  timeoutMs?: number
  credentials?: RequestCredentials
  headers?: () => Record<string, string | undefined>
  buildRequestPayload?: (req: LLMRequest, config: HttpProviderConfig) => Record<string, unknown>
  mapResponse?: (payload: any, req: LLMRequest, config: HttpProviderConfig) => Partial<LLMResponse>
}

class AsyncSemaphore {
  private active = 0
  private queue: Array<() => void> = []

  constructor(private limit: number) {}

  async acquire(signal?: AbortSignal) {
    if (this.limit <= 0) return
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    if (this.active < this.limit) {
      this.active += 1
      return
    }
    await new Promise<void>((resolve, reject) => {
      const onAbort = () => {
        signal?.removeEventListener('abort', onAbort)
        reject(new DOMException('Aborted', 'AbortError'))
      }
      if (signal) signal.addEventListener('abort', onAbort)
      this.queue.push(() => {
        signal?.removeEventListener('abort', onAbort)
        this.active += 1
        resolve()
      })
    })
  }

  release() {
    if (this.limit <= 0) return
    this.active = Math.max(0, this.active - 1)
    const next = this.queue.shift()
    if (next) next()
  }
}

class RateLimiter {
  private windowStart = Date.now()
  private count = 0

  constructor(private maxPerMinute: number) {}

  async acquire(signal?: AbortSignal) {
    if (this.maxPerMinute <= 0) return
    while (true) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
      const now = Date.now()
      if (now - this.windowStart >= 60_000) {
        this.windowStart = now
        this.count = 0
      }
      if (this.count < this.maxPerMinute) {
        this.count += 1
        return
      }
      const waitFor = 60_000 - (now - this.windowStart)
      await wait(waitFor, signal)
    }
  }
}

class HttpLLMProvider implements LLMProvider {
  private semaphore: AsyncSemaphore
  private rateLimiter: RateLimiter

  name: ProviderName
  pricingPer1k: LLMProvider['pricingPer1k']

  constructor(private config: HttpProviderConfig) {
    this.name = config.name
    this.pricingPer1k = config.pricingPer1k
    this.semaphore = new AsyncSemaphore(config.maxConcurrency ?? 4)
    this.rateLimiter = new RateLimiter(config.requestsPerMinute ?? 60)
  }

  async complete(req: LLMRequest): Promise<LLMResponse> {
    const startedAt = now()
    await this.rateLimiter.acquire(req.signal)
    await this.semaphore.acquire(req.signal)
    const { signal, cleanup } = createRequestSignal(req.signal, this.config.timeoutMs)
    try {
      const payload = this.config.buildRequestPayload
        ? this.config.buildRequestPayload(req, this.config)
        : {
            provider: this.config.target,
            model: req.model || this.config.defaultModel,
            prompt: req.prompt,
            maxTokens: req.maxTokens ?? this.config.defaultMaxTokens,
            temperature: req.temperature ?? this.config.defaultTemperature,
          }

      const response = await fetch(this.config.endpoint, {
        method: 'POST',
        credentials: this.config.credentials ?? 'include',
        signal,
        headers: buildHeaders(this.config.headers),
        body: JSON.stringify(payload),
      })

      if (response.status === 429) {
        throw new RateLimitError()
      }

      if (!response.ok) {
        throw new ProviderError(`Provider ${this.name} failed: ${response.status}`, response.status)
      }

      const body = await response.json().catch(() => ({}))
      const mapped = this.config.mapResponse ? this.config.mapResponse(body, req, this.config) : {}
      const tokensIn =
        mapped.tokensIn ?? body?.usage?.prompt_tokens ?? body?.tokens?.input ?? estimateTokens(req.prompt)
      const tokensOut =
        mapped.tokensOut ??
        body?.usage?.completion_tokens ??
        body?.tokens?.output ??
        req.maxTokens ??
        this.config.defaultMaxTokens
      const estimatedCostUSD =
        mapped.estimatedCostUSD ??
        body?.costUSD ??
        estimateCost(tokensIn, tokensOut, this.pricingPer1k.inputUSD, this.pricingPer1k.outputUSD)

      return {
        text: mapped.text ?? body?.text ?? body?.choices?.[0]?.message?.content ?? '',
        tokensIn,
        tokensOut,
        estimatedCostUSD,
        provider: this.name,
        latencyMs: Math.round(now() - startedAt),
      }
    } catch (error) {
      if (error instanceof RateLimitError || error instanceof ProviderError || isAbortError(error)) {
        throw error
      }
      if (error instanceof Error) {
        throw new ProviderError(error.message)
      }
      throw new ProviderError('LLM provider failed')
    } finally {
      cleanup()
      this.semaphore.release()
    }
  }
}

function buildHeaders(factory?: () => Record<string, string | undefined>) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  const extra = factory?.() ?? {}
  for (const [key, value] of Object.entries(extra)) {
    if (typeof value === 'string' && value.length > 0) {
      headers[key] = value
    }
  }
  return headers
}

function createRequestSignal(parent?: AbortSignal, timeoutMs?: number) {
  if (!parent && !timeoutMs) {
    return { signal: undefined, cleanup: () => {} }
  }

  if (!timeoutMs) {
    return { signal: parent, cleanup: () => {} }
  }

  const controller = new AbortController()
  const onAbort = () => controller.abort()
  if (parent) {
    if (parent.aborted) {
      controller.abort()
    } else {
      parent.addEventListener('abort', onAbort, { once: true })
    }
  }

  const timer = setTimeout(() => controller.abort(), timeoutMs)

  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timer)
      parent?.removeEventListener('abort', onAbort)
    },
  }
}

function isAbortError(error: unknown) {
  if (!error) return false
  if (typeof DOMException !== 'undefined' && error instanceof DOMException) {
    return error.name === 'AbortError'
  }
  return (error as any)?.name === 'AbortError' || (error as any)?.code === 'ERR_CANCELED'
}

export interface RoutingContext {
  remainingDailyUSD: number
  remainingMonthlyUSD: number
  task: 'plan' | 'analyze' | 'code' | 'test' | 'doc'
  qualityBias?: 'low' | 'medium' | 'high'
}

export class CostAwareRouter {
  constructor(private providers: Partial<Record<ProviderName, LLMProvider>>) {}

  pickProvider(ctx: RoutingContext): LLMProvider {
  const chatgpt = this.providers.chatgpt
  const junie = this.providers.junie
    const preferJunie = ctx.task === 'plan' || ctx.task === 'analyze' || ctx.task === 'doc'
    const budgetTight = ctx.remainingMonthlyUSD < 50 || ctx.remainingDailyUSD < 2

    if (!chatgpt && !junie) {
      throw new ProviderError('No LLM providers configured')
    }
    if (!chatgpt && junie) return junie
    if (!junie && chatgpt) return chatgpt

    const ensuredChatgpt = chatgpt!
    const ensuredJunie = junie!

    if (preferJunie || budgetTight) return ensuredJunie
    if (ctx.qualityBias === 'high' && ctx.task !== 'doc') return ensuredChatgpt
    return ensuredJunie
  }

  fallbackProvider(current: ProviderName): LLMProvider | null {
    const alternatives = Object.entries(this.providers)
      .filter(([name, provider]) => name !== current && Boolean(provider))
      .map(([, provider]) => provider as LLMProvider)
    return alternatives[0] || null
  }
}

export class LLMClient {
  constructor(private router: CostAwareRouter) {}

  async complete(req: LLMRequest, ctx: RoutingContext): Promise<LLMResponse> {
    const primary = this.router.pickProvider(ctx)
    try {
      return await primary.complete(req)
    } catch (error) {
      const fallback = this.router.fallbackProvider(primary.name)
      if (!fallback) throw error
      if (error instanceof RateLimitError || error instanceof ProviderError) {
        return fallback.complete(req)
      }
      throw error
    }
  }
}

function readNumber(value: string | undefined, fallback: number) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function getProxyEndpoint() {
  return (process.env.LLM_PROXY_URL || process.env.NEXT_PUBLIC_LLM_PROXY_URL || '/api/v1/llm/proxy').trim()
}

function createProxyProvider(name: ProviderName): LLMProvider {
  const isChatGPT = name === 'chatgpt'
  return new HttpLLMProvider({
    name,
    target: name,
    endpoint: getProxyEndpoint(),
    defaultModel: isChatGPT
      ? process.env.NEXT_PUBLIC_LLM_CHATGPT_MODEL || 'gpt-4o-mini'
      : process.env.NEXT_PUBLIC_LLM_JUNIE_MODEL || 'junie-pro',
    defaultMaxTokens: isChatGPT ? 512 : 384,
    defaultTemperature: isChatGPT ? 0.2 : 0.3,
    pricingPer1k: isChatGPT
      ? { inputUSD: 0.005, outputUSD: 0.015 }
      : { inputUSD: 0.003, outputUSD: 0.009 },
    maxConcurrency: isChatGPT ? 2 : 4,
    requestsPerMinute: readNumber(
      isChatGPT ? process.env.NEXT_PUBLIC_LLM_CHATGPT_RPM : process.env.NEXT_PUBLIC_LLM_JUNIE_RPM,
      isChatGPT ? 40 : 60,
    ),
    credentials: 'include',
  })
}

function createChatgptProvider(): LLMProvider {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return createProxyProvider('chatgpt')
  }

  return new HttpLLMProvider({
    name: 'chatgpt',
    endpoint: (process.env.OPENAI_API_BASE || 'https://api.openai.com/v1/chat/completions').trim(),
    defaultModel: process.env.NEXT_PUBLIC_LLM_CHATGPT_MODEL || 'gpt-4o-mini',
    defaultMaxTokens: 512,
    defaultTemperature: 0.2,
    pricingPer1k: { inputUSD: 0.005, outputUSD: 0.015 },
    maxConcurrency: 2,
    requestsPerMinute: readNumber(
      process.env.NEXT_PUBLIC_LLM_CHATGPT_RPM || process.env.LLM_CHATGPT_RPM,
      40,
    ),
    timeoutMs: 30_000,
    credentials: 'omit',
    headers: () => ({ Authorization: `Bearer ${apiKey}` }),
    buildRequestPayload: (req, config) => ({
      model: req.model || config.defaultModel,
      messages: [{ role: 'user', content: req.prompt }],
      max_tokens: req.maxTokens ?? config.defaultMaxTokens,
      temperature: req.temperature ?? config.defaultTemperature,
    }),
    mapResponse: (payload, req, config) => ({
      text: payload?.choices?.[0]?.message?.content ?? payload?.choices?.[0]?.text ?? payload?.text,
      tokensIn: payload?.usage?.prompt_tokens ?? estimateTokens(req.prompt),
      tokensOut: payload?.usage?.completion_tokens ?? config.defaultMaxTokens,
      estimatedCostUSD:
        payload?.usage?.prompt_tokens != null && payload?.usage?.completion_tokens != null
          ? estimateCost(
              payload.usage.prompt_tokens,
              payload.usage.completion_tokens,
              config.pricingPer1k.inputUSD,
              config.pricingPer1k.outputUSD,
            )
          : undefined,
    }),
  })
}

function createJunieProvider(): LLMProvider {
  const apiKey = process.env.JUNIE_API_KEY
  const endpoint = process.env.JUNIE_API_URL
  if (!apiKey || !endpoint) {
    return createProxyProvider('junie')
  }

  return new HttpLLMProvider({
    name: 'junie',
    endpoint: endpoint.trim(),
    defaultModel: process.env.NEXT_PUBLIC_LLM_JUNIE_MODEL || 'junie-pro',
    defaultMaxTokens: 384,
    defaultTemperature: 0.3,
    pricingPer1k: { inputUSD: 0.003, outputUSD: 0.009 },
    maxConcurrency: 4,
    requestsPerMinute: readNumber(
      process.env.NEXT_PUBLIC_LLM_JUNIE_RPM || process.env.LLM_JUNIE_RPM,
      60,
    ),
    timeoutMs: 25_000,
    credentials: 'omit',
    headers: () => ({ Authorization: `Bearer ${apiKey}` }),
    buildRequestPayload: (req, config) => ({
      prompt: req.prompt,
      model: req.model || config.defaultModel,
      max_tokens: req.maxTokens ?? config.defaultMaxTokens,
      temperature: req.temperature ?? config.defaultTemperature,
    }),
    mapResponse: (payload, req, config) => ({
      text: payload?.output ?? payload?.text ?? payload?.choices?.[0]?.message?.content ?? '',
      tokensIn: payload?.usage?.input_tokens ?? estimateTokens(req.prompt),
      tokensOut: payload?.usage?.output_tokens ?? config.defaultMaxTokens,
      estimatedCostUSD: payload?.usage?.total_cost_usd ?? payload?.costUSD,
    }),
  })
}

export function createLLMProviders(): Partial<Record<ProviderName, LLMProvider>> {
  const providers: Partial<Record<ProviderName, LLMProvider>> = {}
  const chatgpt = createChatgptProvider()
  if (chatgpt) providers.chatgpt = chatgpt
  const junie = createJunieProvider()
  if (junie) providers.junie = junie
  return providers
}

export const llmProviders: Partial<Record<ProviderName, LLMProvider>> = createLLMProviders()

export const defaultRouter = new CostAwareRouter(llmProviders)
export const llmClient = new LLMClient(defaultRouter)

export async function generateCompletion(request: LLMRequest, context: RoutingContext) {
  return llmClient.complete(request, context)
}

function estimateTokens(text: string) {
  if (!text) return 0
  return Math.ceil(text.length / 4)
}

function estimateCost(tokensIn: number, tokensOut: number, inputRate: number, outputRate: number) {
  return roundTo4((tokensIn / 1000) * inputRate + (tokensOut / 1000) * outputRate)
}

function roundTo4(value: number) {
  return Math.round(value * 10_000) / 10_000
}

function wait(duration: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, Math.max(0, duration))

    const onAbort = () => {
      clearTimeout(timer)
      reject(new DOMException('Aborted', 'AbortError'))
    }

    if (signal) signal.addEventListener('abort', onAbort, { once: true })
  })
}

function now() {
  if (typeof performance !== 'undefined') return performance.now()
  return Date.now()
}
