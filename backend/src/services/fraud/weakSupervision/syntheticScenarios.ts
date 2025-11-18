import { promises as fs } from 'node:fs';
import { z } from 'zod';
import type { SyntheticScenarioDefinition, SyntheticScenarioSignals } from './types';
import { SyntheticScenarioDefinitionSchema, SyntheticScenarioSignalsSchema } from './types';

interface Options {
  seed?: number;
  maxEvaluate?: number; // early-exit cap for large scenario sets
}

// Simple seedable RNG (LCG) for deterministic behavior in tests
const makeRng = (seed: number) => {
  let state = seed >>> 0;
  return () => {
    state = (1103515245 * state + 12345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
};

export class SyntheticScenarioLibrary {
  private scenarios: SyntheticScenarioDefinition[] = [];
  private readonly rng: () => number;
  private readonly maxEvaluate: number;

  constructor(private readonly scenariosPath: string, options?: Options) {
    const seed = options?.seed ?? 1337;
    this.rng = makeRng(seed);
    this.maxEvaluate = Math.max(1, options?.maxEvaluate ?? parseInt(process.env.WS_SYNTHETIC_MAX_EVAL || '500', 10));
  }

  async load(): Promise<void> {
    const content = await fs.readFile(this.scenariosPath, 'utf8');
    const parsed = JSON.parse(content);
    const arr = z.array(SyntheticScenarioDefinitionSchema).parse(parsed);
    this.scenarios = arr;
  }

  list(): SyntheticScenarioDefinition[] {
    return this.scenarios;
  }

  evaluate(signals: SyntheticScenarioSignals): SyntheticScenarioDefinition[] {
    // Validate inputs at runtime to avoid silent failures
    SyntheticScenarioSignalsSchema.parse(signals);

    const matched: SyntheticScenarioDefinition[] = [];
    for (let i = 0; i < this.scenarios.length; i++) {
      const scenario = this.scenarios[i]!;
      const { thresholds } = scenario;
      if (thresholds.minRequestsPerMinute && signals.requestsPerMinute < thresholds.minRequestsPerMinute) {
        continue;
      }
      if (thresholds.maxUniqueDevicesPerMinute && signals.uniqueDevicesPerMinute > thresholds.maxUniqueDevicesPerMinute) {
        continue;
      }
      if (thresholds.minCreativeSwapRate && signals.creativeSwapRate < thresholds.minCreativeSwapRate) {
        continue;
      }
      if (thresholds.minBundlesPerRequest && signals.bundlesPerRequest < thresholds.minBundlesPerRequest) {
        continue;
      }
      matched.push(scenario);
      if (matched.length >= this.maxEvaluate) {
        break; // early exit to bound worst-case time
      }
    }

    // Deterministic shuffle based on RNG to avoid bias when large sets
    for (let i = matched.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      const tmp = matched[i]!;
      matched[i] = matched[j]!;
      matched[j] = tmp;
    }
    return matched;
  }
}
