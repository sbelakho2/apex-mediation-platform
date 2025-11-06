// LLM provider abstraction with cost-aware routing (stubs; no external calls here)
// This scaffolding enables dual-provider autonomy (Junie + ChatGPT) without requiring keys in dev.

export type ProviderName = 'chatgpt' | 'junie';

export interface LLMRequest {
  model: string;
  prompt: string;
  maxTokens?: number;
  temperature?: number;
}

export interface LLMResponse {
  text: string;
  tokensIn: number;
  tokensOut: number;
  estimatedCostUSD: number;
  provider: ProviderName;
}

export interface LLMProvider {
  name: ProviderName;
  // Synchronous complete for simplicity; real impls will be async network calls.
  complete(req: LLMRequest): Promise<LLMResponse>;
  pricingPer1k: {
    inputUSD: number;
    outputUSD: number;
  };
}

// Stubbed providers for local/dev. Real implementations should be added in a separate secure module.
export class ChatGPTStub implements LLMProvider {
  name: ProviderName = 'chatgpt';
  pricingPer1k = { inputUSD: 0.005, outputUSD: 0.015 }; // Example only; keep in sync with policy doc
  async complete(req: LLMRequest): Promise<LLMResponse> {
    const tokensIn = Math.ceil((req.prompt?.length || 0) / 4);
    const tokensOut = Math.ceil((req.maxTokens || 256) * 0.5);
    const estimatedCostUSD = (tokensIn / 1000) * this.pricingPer1k.inputUSD + (tokensOut / 1000) * this.pricingPer1k.outputUSD;
    return {
      text: `[chatgpt-stub:${req.model}]`,
      tokensIn,
      tokensOut,
      estimatedCostUSD,
      provider: this.name,
    };
  }
}

export class JunieStub implements LLMProvider {
  name: ProviderName = 'junie';
  pricingPer1k = { inputUSD: 0.003, outputUSD: 0.009 }; // Example lower cost for routing preference
  async complete(req: LLMRequest): Promise<LLMResponse> {
    const tokensIn = Math.ceil((req.prompt?.length || 0) / 4);
    const tokensOut = Math.ceil((req.maxTokens || 256) * 0.5);
    const estimatedCostUSD = (tokensIn / 1000) * this.pricingPer1k.inputUSD + (tokensOut / 1000) * this.pricingPer1k.outputUSD;
    return {
      text: `[junie-stub:${req.model}]`,
      tokensIn,
      tokensOut,
      estimatedCostUSD,
      provider: this.name,
    };
  }
}

export interface RoutingContext {
  remainingDailyUSD: number;
  remainingMonthlyUSD: number;
  task: 'plan' | 'analyze' | 'code' | 'test' | 'doc';
  qualityBias?: 'low' | 'medium' | 'high';
}

export class CostAwareRouter {
  constructor(private chatgpt: LLMProvider, private junie: LLMProvider) {}

  pickProvider(ctx: RoutingContext): LLMProvider {
    // Prefer Junie for plan/analyze/doc when budget is tight; use ChatGPT for code/test if allowed.
    const preferJunie = ctx.task === 'plan' || ctx.task === 'analyze' || ctx.task === 'doc';
    const budgetTight = ctx.remainingMonthlyUSD < 50 || ctx.remainingDailyUSD < 2;

    if (preferJunie || budgetTight) return this.junie;
    // Otherwise, choose based on quality bias
    if (ctx.qualityBias === 'high' && ctx.task !== 'doc') return this.chatgpt;
    return this.junie;
  }
}
