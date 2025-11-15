// LLM provider abstraction with cost-aware routing and rate-limit-aware HTTP providers.

export type ProviderName = 'chatgpt' | 'junie'

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
  pricingPer1k: {
    inputUSD: number
    outputUSD: number
  }
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
  target: ProviderName
  defaultModel: string
  defaultMaxTokens: number
  defaultTemperature: number
  pricingPer1k: LLMProvider['pricingPer1k']
  maxConcurrency?: number
  requestsPerMinute?: number
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
  const signal = req.signal
  const startedAt = now()
    await this.rateLimiter.acquire(signal)
    await this.semaphore.acquire(signal)
    try {
      const response = await fetch(this.config.endpoint, {
        method: 'POST',
        credentials: 'include',
        signal,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          provider: this.config.target,
          model: req.model || this.config.defaultModel,
          prompt: req.prompt,
          maxTokens: req.maxTokens ?? this.config.defaultMaxTokens,
          temperature: req.temperature ?? this.config.defaultTemperature,
        }),
      })

      if (response.status === 429) {
        throw new RateLimitError()
      }

      if (!response.ok) {
        throw new ProviderError(`Provider ${this.name} failed: ${response.status}`, response.status)
      }

      const payload = await response.json().catch(() => ({}))
      const tokensIn = payload?.usage?.prompt_tokens ?? payload?.tokens?.input ?? estimateTokens(req.prompt)
      const tokensOut =
        payload?.usage?.completion_tokens ?? payload?.tokens?.output ?? req.maxTokens ?? this.config.defaultMaxTokens
      const estimatedCostUSD =
        payload?.costUSD ?? estimateCost(tokensIn, tokensOut, this.pricingPer1k.inputUSD, this.pricingPer1k.outputUSD)
      return {
        text: payload?.text ?? payload?.choices?.[0]?.message?.content ?? '',
        tokensIn,
        tokensOut,
        estimatedCostUSD,
        provider: this.name,
        latencyMs: Math.round(now() - startedAt),
      }
    } finally {
      this.semaphore.release()
    }
  }
}

export interface RoutingContext {
  remainingDailyUSD: number
  remainingMonthlyUSD: number
  task: 'plan' | 'analyze' | 'code' | 'test' | 'doc'
  qualityBias?: 'low' | 'medium' | 'high'
}

export class CostAwareRouter {
  constructor(private providers: Record<ProviderName, LLMProvider>) {}

  pickProvider(ctx: RoutingContext): LLMProvider {
    const chatgpt = this.providers.chatgpt
    const junie = this.providers.junie
    const preferJunie = ctx.task === 'plan' || ctx.task === 'analyze' || ctx.task === 'doc'
    const budgetTight = ctx.remainingMonthlyUSD < 50 || ctx.remainingDailyUSD < 2

    if (!chatgpt) return junie
    if (!junie) return chatgpt

    if (preferJunie || budgetTight) return junie
    if (ctx.qualityBias === 'high' && ctx.task !== 'doc') return chatgpt
    return junie
  }

  fallbackProvider(current: ProviderName): LLMProvider | null {
    const alternatives = Object.entries(this.providers)
      .filter(([name]) => name !== current)
      .map(([, provider]) => provider)
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

const proxyUrl = (process.env.NEXT_PUBLIC_LLM_PROXY_URL || '/api/v1/llm/proxy').trim()

const chatgptProvider = new HttpLLMProvider({
  name: 'chatgpt',
  target: 'chatgpt',
  endpoint: proxyUrl,
  defaultModel: process.env.NEXT_PUBLIC_LLM_CHATGPT_MODEL || 'gpt-4o-mini',
  defaultMaxTokens: 512,
  defaultTemperature: 0.2,
  pricingPer1k: { inputUSD: 0.005, outputUSD: 0.015 },
  maxConcurrency: 2,
  requestsPerMinute: Number(process.env.NEXT_PUBLIC_LLM_CHATGPT_RPM || 40),
})

const junieProvider = new HttpLLMProvider({
  name: 'junie',
  target: 'junie',
  endpoint: proxyUrl,
  defaultModel: process.env.NEXT_PUBLIC_LLM_JUNIE_MODEL || 'junie-pro',
  defaultMaxTokens: 384,
  defaultTemperature: 0.3,
  pricingPer1k: { inputUSD: 0.003, outputUSD: 0.009 },
  maxConcurrency: 4,
  requestsPerMinute: Number(process.env.NEXT_PUBLIC_LLM_JUNIE_RPM || 60),
})

export const llmProviders: Record<ProviderName, LLMProvider> = {
  chatgpt: chatgptProvider,
  junie: junieProvider,
}

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
