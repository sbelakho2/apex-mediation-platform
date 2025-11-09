import { promises as fs } from 'node:fs';
import type { SyntheticScenarioDefinition, SyntheticScenarioSignals } from './types';

export class SyntheticScenarioLibrary {
  private scenarios: SyntheticScenarioDefinition[] = [];

  constructor(private readonly scenariosPath: string) {}

  async load(): Promise<void> {
    const content = await fs.readFile(this.scenariosPath, 'utf8');
    this.scenarios = JSON.parse(content) as SyntheticScenarioDefinition[];
  }

  list(): SyntheticScenarioDefinition[] {
    return this.scenarios;
  }

  evaluate(signals: SyntheticScenarioSignals): SyntheticScenarioDefinition[] {
    return this.scenarios.filter((scenario) => {
      const { thresholds } = scenario;
      if (thresholds.minRequestsPerMinute && signals.requestsPerMinute < thresholds.minRequestsPerMinute) {
        return false;
      }
      if (
        thresholds.maxUniqueDevicesPerMinute &&
        signals.uniqueDevicesPerMinute > thresholds.maxUniqueDevicesPerMinute
      ) {
        return false;
      }
      if (
        thresholds.minCreativeSwapRate &&
        signals.creativeSwapRate < thresholds.minCreativeSwapRate
      ) {
        return false;
      }
      if (
        thresholds.minBundlesPerRequest &&
        signals.bundlesPerRequest < thresholds.minBundlesPerRequest
      ) {
        return false;
      }
      return true;
    });
  }
}
