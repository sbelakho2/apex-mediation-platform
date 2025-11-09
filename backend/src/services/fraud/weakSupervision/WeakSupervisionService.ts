import { promises as fs } from 'node:fs';
import path from 'node:path';
import { enrichmentService as defaultEnrichmentService, EnrichmentService as EnrichmentServiceType } from '../../enrichment/enrichmentService';
import logger from '../../../utils/logger';
import {
  LabelClass,
  LabelFunctionOutcome,
  LabelQualityReport,
  PrecisionProxy,
  WeakSupervisionContext,
  WeakSupervisionResult,
} from './types';
import { SupplyChainCorpus } from './supplyChainCorpus';
import { SyntheticScenarioLibrary } from './syntheticScenarios';

interface WeakSupervisionManifest {
  supplyChain: {
    appAds: string;
    sellers: string;
  };
  syntheticScenarios: string;
}

const DEFAULT_BASE_DIR = path.resolve(process.cwd(), 'data', 'weak-supervision');

export class WeakSupervisionService {
  private readonly baseDir: string;
  private readonly enrichmentService: EnrichmentServiceType;
  private manifest: WeakSupervisionManifest | null = null;
  private supplyChainCorpus: SupplyChainCorpus | null = null;
  private syntheticLibrary: SyntheticScenarioLibrary | null = null;
  private initialized: boolean = false;
  private loadingPromise: Promise<void> | null = null;

  constructor(options?: { baseDir?: string; enrichmentService?: EnrichmentServiceType }) {
    this.baseDir = options?.baseDir ?? DEFAULT_BASE_DIR;
    this.enrichmentService = options?.enrichmentService ?? defaultEnrichmentService;
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    if (this.loadingPromise) {
      return this.loadingPromise;
    }

    this.loadingPromise = this.performInitialization();
    try {
      await this.loadingPromise;
    } finally {
      this.loadingPromise = null;
    }
  }

  private async performInitialization(): Promise<void> {
    this.manifest = await this.loadManifest();
    const { appAdsPath, sellersPath } = SupplyChainCorpus.resolvePaths(
      this.baseDir,
      this.manifest.supplyChain.appAds,
      this.manifest.supplyChain.sellers
    );

    this.supplyChainCorpus = new SupplyChainCorpus(appAdsPath, sellersPath);
    this.syntheticLibrary = new SyntheticScenarioLibrary(
      path.resolve(this.baseDir, this.manifest.syntheticScenarios)
    );

  await Promise.all([this.supplyChainCorpus.load(), this.syntheticLibrary.load()]);
  logger.info('WeakSupervisionService initialized', {
      baseDir: this.baseDir,
      syntheticScenarioCount: this.syntheticLibrary.list().length,
    });

    this.initialized = true;
  }

  private async loadManifest(): Promise<WeakSupervisionManifest> {
    const manifestPath = path.resolve(this.baseDir, 'manifest.json');
    const content = await fs.readFile(manifestPath, 'utf8');
    return JSON.parse(content) as WeakSupervisionManifest;
  }

  async evaluateEvent(context: WeakSupervisionContext): Promise<WeakSupervisionResult> {
    await this.initialize();
    await this.enrichmentService.initialize();

    const outcomes: LabelFunctionOutcome[] = [];

    outcomes.push(...this.evaluateSupplyChain(context));
    outcomes.push(...(await this.evaluateNetworkOrigin(context)));
    outcomes.push(...this.evaluateCtit(context));
    outcomes.push(...this.evaluateOmsdk(context));
    outcomes.push(...this.evaluateSyntheticScenarios(context));

    return {
      context,
      outcomes,
    };
  }

  async evaluateBatch(contexts: WeakSupervisionContext[]): Promise<{
    results: WeakSupervisionResult[];
    report: LabelQualityReport;
  }> {
    const results = await Promise.all(contexts.map((context) => this.evaluateEvent(context)));
    const report = this.buildLabelQualityReport(results);
    return { results, report };
  }

  private evaluateSupplyChain(context: WeakSupervisionContext): LabelFunctionOutcome[] {
    if (!this.supplyChainCorpus) {
      throw new Error('SupplyChainCorpus has not been initialized');
    }

    const result = this.supplyChainCorpus.evaluateAuthorization(context.supplyChain);

    if (!result.authorized) {
      const reasons = [result.reason ?? 'Seller unauthorized for declared supply chain'];
      if (result.sellerInfo?.name) {
        reasons.push(`Directory seller name: ${result.sellerInfo.name}`);
      }
      return [
        {
          functionName: 'supply_chain_authorization',
          label: 'fraud',
          confidence: 0.9,
          reasons,
          signals: {
            sellerId: context.supplyChain.sellerId,
            domain: context.supplyChain.domain,
            appStoreId: context.supplyChain.appStoreId,
          },
        },
      ];
    }

    return [
      {
        functionName: 'supply_chain_authorization',
        label: 'legit',
        confidence: 0.6,
        reasons: ['Seller authorized via app-ads.txt corpus'],
        signals: {
          sellerId: context.supplyChain.sellerId,
          domain: context.supplyChain.domain,
        },
      },
    ];
  }

  private async evaluateNetworkOrigin(context: WeakSupervisionContext): Promise<LabelFunctionOutcome[]> {
    const outcomes: LabelFunctionOutcome[] = [];
    const enrichment = this.enrichmentService.lookupIp(context.network.ip);
    const userAgentInfo = context.network.userAgent
      ? this.enrichmentService.parseUserAgent(context.network.userAgent)
      : null;

    const reasons: string[] = [];
    let label: LabelClass = 'legit';
    let confidence = 0.5;

    if (enrichment.vpnMatches.length > 0 || enrichment.cloudProviders.length > 0) {
      label = 'fraud';
      confidence = Math.max(confidence, 0.8);
      if (enrichment.vpnMatches.length > 0) {
        reasons.push(`IP listed in VPN/DC datasets: ${enrichment.vpnMatches.join(', ')}`);
      }
      if (enrichment.cloudProviders.length > 0) {
        reasons.push(`IP resolves to cloud provider ${enrichment.cloudProviders.join(', ')}`);
      }
    }

    if (enrichment.isTorExitNode) {
      label = 'fraud';
      confidence = 0.9;
      reasons.push('IP is Tor exit node');
    }

    if ([context.network.paymentCountry, context.network.appStoreCountry].includes(context.network.deviceCountry ?? null)) {
      // expected alignment, do nothing
    } else if (context.network.deviceCountry && context.network.paymentCountry && context.network.deviceCountry !== context.network.paymentCountry) {
      label = 'fraud';
      confidence = Math.max(confidence, 0.75);
      reasons.push(
        `Country mismatch between device (${context.network.deviceCountry}) and payment (${context.network.paymentCountry})`
      );
    }

    if (context.network.expectedTimezone && context.network.timezone && context.network.expectedTimezone !== context.network.timezone) {
      label = 'fraud';
      confidence = Math.max(confidence, 0.7);
      reasons.push(
        `Timezone mismatch: expected ${context.network.expectedTimezone}, observed ${context.network.timezone}`
      );
    }

    if (context.network.expectedCarrier && context.network.carrier && context.network.expectedCarrier !== context.network.carrier) {
      label = 'fraud';
      confidence = Math.max(confidence, 0.65);
      reasons.push(
        `Carrier mismatch: expected ${context.network.expectedCarrier}, observed ${context.network.carrier}`
      );
    }

    if (userAgentInfo && userAgentInfo.category === 'mobile' && (enrichment.cloudProviders.length > 0 || enrichment.vpnMatches.length > 0)) {
      label = 'fraud';
      confidence = Math.max(confidence, 0.9);
      reasons.push('Mobile UA combined with VPN/DC hosting indicates proxy usage');
    }

    if (label === 'legit' && reasons.length === 0) {
      reasons.push('Network origin indicators aligned with expectations');
    }

    outcomes.push({
      functionName: 'network_origin_anomaly',
      label,
      confidence,
      reasons,
      signals: {
        ip: context.network.ip,
        vpnMatches: enrichment.vpnMatches,
        cloudProviders: enrichment.cloudProviders,
        asn: enrichment.asn,
      },
    });

    return outcomes;
  }

  private evaluateCtit(context: WeakSupervisionContext): LabelFunctionOutcome[] {
    const outcomes: LabelFunctionOutcome[] = [];
    const { seconds, history } = context.ctit;

    if (seconds <= 5) {
      outcomes.push({
        functionName: 'ctit_ultra_short',
        label: 'fraud',
        confidence: 0.85,
        reasons: ['Click-to-install time under 5 seconds indicates potential click injection'],
        signals: { seconds },
      });
      return outcomes;
    }

    if (seconds >= 86400) {
      outcomes.push({
        functionName: 'ctit_ultra_long',
        label: 'fraud',
        confidence: 0.7,
        reasons: ['Click-to-install time exceeds 24 hours, indicating possible click spamming'],
        signals: { seconds },
      });
      return outcomes;
    }

    if (history) {
      const { partnerMeanSeconds, partnerP95Seconds } = history;
      if (partnerP95Seconds && seconds > partnerP95Seconds * 1.5) {
        outcomes.push({
          functionName: 'ctit_partner_long_tail',
          label: 'fraud',
          confidence: 0.65,
          reasons: [
            `CTIT ${seconds}s exceeds partner p95 ${partnerP95Seconds}s by >50%`,
          ],
          signals: { seconds, partnerP95Seconds },
        });
        return outcomes;
      }

      if (partnerMeanSeconds && seconds < partnerMeanSeconds * 0.3) {
        outcomes.push({
          functionName: 'ctit_partner_short_spike',
          label: 'fraud',
          confidence: 0.65,
          reasons: [
            `CTIT ${seconds}s significantly below partner mean ${partnerMeanSeconds}s`,
          ],
          signals: { seconds, partnerMeanSeconds },
        });
        return outcomes;
      }
    }

    outcomes.push({
      functionName: 'ctit_baseline',
      label: 'legit',
      confidence: 0.55,
      reasons: ['CTIT within expected bounds for partner and global distribution'],
      signals: { seconds },
    });

    return outcomes;
  }

  private evaluateOmsdk(context: WeakSupervisionContext): LabelFunctionOutcome[] {
    const outcomes: LabelFunctionOutcome[] = [];
    const { omsdk } = context;
    const reasons: string[] = [];
    let label: LabelClass = 'legit';
    let confidence = 0.5;

    if (!omsdk.sessionStarted && omsdk.wasViewable) {
      label = 'fraud';
      confidence = 0.85;
      reasons.push('OMSDK session not started but impression flagged viewable');
    }

    if (omsdk.measurable && omsdk.viewableTimeMs < 1000 && omsdk.wasViewable) {
      label = 'fraud';
      confidence = Math.max(confidence, 0.75);
      reasons.push('Viewable time < 1s despite measurable session');
    }

    if (omsdk.geometry && omsdk.geometry.coveragePercent < 50) {
      label = 'fraud';
      confidence = Math.max(confidence, 0.7);
      reasons.push(`Viewport coverage only ${omsdk.geometry.coveragePercent}%`);
    }

    if (omsdk.geometry && omsdk.geometry.overlappingCreatives > 2) {
      label = 'fraud';
      confidence = Math.max(confidence, 0.7);
      reasons.push(`Detected ${omsdk.geometry.overlappingCreatives} overlapping creatives`);
    }

    if (label === 'legit') {
      reasons.push('OMSDK session consistent with viewability expectations');
    }

    outcomes.push({
      functionName: 'omsdk_viewability_consistency',
      label,
      confidence,
      reasons,
      signals: {
        viewableTimeMs: omsdk.viewableTimeMs,
        measurable: omsdk.measurable,
        sessionStarted: omsdk.sessionStarted,
      },
    });

    return outcomes;
  }

  private evaluateSyntheticScenarios(context: WeakSupervisionContext): LabelFunctionOutcome[] {
    if (!this.syntheticLibrary) {
      throw new Error('SyntheticScenarioLibrary has not been initialized');
    }

    const matches = this.syntheticLibrary.evaluate(context.synthetic);
    if (matches.length === 0) {
      return [
        {
          functionName: 'synthetic_scenario_detection',
          label: 'legit',
          confidence: 0.4,
          reasons: ['No synthetic fraud patterns detected in telemetry'],
          signals: { ...context.synthetic },
        },
      ];
    }

    return matches.map<LabelFunctionOutcome>((match) => ({
      functionName: `synthetic_scenario_${match.name}`,
      label: match.label,
      confidence: match.confidence,
      reasons: [match.description, match.rationale],
      signals: { ...context.synthetic },
    }));
  }

  private buildLabelQualityReport(results: WeakSupervisionResult[]): LabelQualityReport {
    const coverage: Record<string, number> = {};
    const precision: Record<string, PrecisionProxy> = {};
    let conflictCount = 0;

    const totalEvents = results.length;

    for (const result of results) {
      const labelsByFunction = new Map<string, LabelFunctionOutcome[]>();
      for (const outcome of result.outcomes) {
        const bucket = labelsByFunction.get(outcome.functionName) ?? [];
        bucket.push(outcome);
        labelsByFunction.set(outcome.functionName, bucket);

        const existingCoverage = coverage[outcome.functionName] ?? 0;
        coverage[outcome.functionName] = existingCoverage + (outcome.label === 'fraud' ? 1 : 0);

        if (result.context.groundTruthLabel) {
          const proxy = precision[outcome.functionName] ?? {
            truePositives: 0,
            falsePositives: 0,
            precision: null,
          };
          if (outcome.label === 'fraud') {
            if (result.context.groundTruthLabel === 'fraud') {
              proxy.truePositives += 1;
            } else if (result.context.groundTruthLabel === 'legit') {
              proxy.falsePositives += 1;
            }
          }
          proxy.precision = this.calculatePrecision(proxy.truePositives, proxy.falsePositives);
          precision[outcome.functionName] = proxy;
        }
      }

      const hasFraud = Array.from(labelsByFunction.values()).some((entries) =>
        entries.some((outcome) => outcome.label === 'fraud')
      );
      const hasLegit = Array.from(labelsByFunction.values()).some((entries) =>
        entries.some((outcome) => outcome.label === 'legit')
      );
      if (hasFraud && hasLegit) {
        conflictCount += 1;
      }
    }

    const normalizedCoverage: Record<string, number> = {};
    for (const [functionName, fraudCount] of Object.entries(coverage)) {
      normalizedCoverage[functionName] = totalEvents === 0 ? 0 : fraudCount / totalEvents;
    }

    return {
      coverage: normalizedCoverage,
      conflictRate: totalEvents === 0 ? 0 : conflictCount / totalEvents,
      precisionProxy: precision,
      totalEvents,
    };
  }

  private calculatePrecision(tp: number, fp: number): number | null {
    if (tp === 0 && fp === 0) {
      return null;
    }
    return tp / (tp + fp);
  }
}

export const weakSupervisionService = new WeakSupervisionService();
export default weakSupervisionService;
