import { createLLMProviders, CostAwareRouter, LLMClient, RateLimitError, LLMProvider, LLMRequest, RoutingContext } from './providers'

describe('LLM providers', () => {
  const originalEnv = process.env
  const originalFetch = global.fetch

  beforeEach(() => {
    process.env = { ...originalEnv }
    ;(global as unknown as { fetch: jest.Mock }).fetch = jest.fn()
  })

  afterEach(() => {
    process.env = originalEnv
    if (originalFetch) {
      global.fetch = originalFetch
    }
    jest.clearAllMocks()
  })

  it('falls back to proxy when no direct credentials configured', async () => {
    process.env.NEXT_PUBLIC_LLM_PROXY_URL = 'https://proxy.test/api'
    delete process.env.OPENAI_API_KEY
    delete process.env.JUNIE_API_KEY
    delete process.env.JUNIE_API_URL

    const fetchMock = global.fetch as jest.Mock
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        text: 'proxy-response',
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      }),
    })

    const providers = createLLMProviders()
    if (!providers.chatgpt) {
      throw new Error('chatgpt provider was not registered')
    }
    await providers.chatgpt.complete({ prompt: 'hello world' })

    expect(fetchMock).toHaveBeenCalledWith(
      'https://proxy.test/api',
      expect.objectContaining({
        credentials: 'include',
        body: expect.stringContaining('"provider":"chatgpt"'),
      }),
    )
  })

  it('sends Authorization header for direct OpenAI provider', async () => {
    process.env.OPENAI_API_KEY = 'sk-direct-test'
    process.env.OPENAI_API_BASE = 'https://openai.test/v1/chat'

    const fetchMock = global.fetch as jest.Mock
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: 'hi!' } }],
        usage: { prompt_tokens: 12, completion_tokens: 8 },
      }),
    })

    const providers = createLLMProviders()
    if (!providers.chatgpt) {
      throw new Error('chatgpt provider was not registered')
    }
    await providers.chatgpt.complete({ prompt: 'hello!' })

    expect(fetchMock).toHaveBeenCalledWith(
      'https://openai.test/v1/chat',
      expect.objectContaining({
        credentials: 'omit',
        headers: expect.objectContaining({ Authorization: 'Bearer sk-direct-test' }),
        body: expect.stringContaining('"messages"'),
      }),
    )
  })

  it('LLMClient falls back to alternate provider on rate limit', async () => {
    const failingProvider: LLMProvider = {
      name: 'chatgpt',
      pricingPer1k: { inputUSD: 0.005, outputUSD: 0.015 },
      complete: jest.fn<Promise<any>, [LLMRequest]>(() => Promise.reject(new RateLimitError())),
    }

    const successResponse = {
      text: 'fallback',
      tokensIn: 10,
      tokensOut: 20,
      estimatedCostUSD: 0.02,
      provider: 'junie' as const,
    }

    const fallbackProvider: LLMProvider = {
      name: 'junie',
      pricingPer1k: { inputUSD: 0.003, outputUSD: 0.009 },
      complete: jest.fn(async () => successResponse),
    }

    const router = new CostAwareRouter({ chatgpt: failingProvider, junie: fallbackProvider })
    const client = new LLMClient(router)
    const context: RoutingContext = {
      remainingDailyUSD: 100,
      remainingMonthlyUSD: 500,
      task: 'code',
      qualityBias: 'high',
    }

    const result = await client.complete({ prompt: 'write code' }, context)

    expect(result).toEqual(successResponse)
    expect(failingProvider.complete).toHaveBeenCalledTimes(1)
    expect(fallbackProvider.complete).toHaveBeenCalledTimes(1)
  })
})
