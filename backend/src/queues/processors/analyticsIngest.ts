import { Job } from 'bullmq';
import analyticsService from '../../services/analyticsService';
import { analyticsEventsFailedTotal, analyticsEventsWrittenTotal } from '../../utils/prometheus';
import { safeInc } from '../../utils/metrics';
import type {
  ImpressionEventDTO,
  ClickEventDTO,
  RevenueEventDTO,
} from '../../types/analytics.types';

type AnalyticsIngestJob =
  | { kind: 'impressions'; events: ImpressionEventDTO[] }
  | { kind: 'clicks'; events: ClickEventDTO[] }
  | { kind: 'revenue'; events: RevenueEventDTO[] };

export async function processAnalyticsIngest(job: Job<AnalyticsIngestJob>) {
  const { kind, events } = job.data;
  if (!Array.isArray(events) || events.length === 0) {
    return;
  }

  try {
    if (kind === 'impressions') {
      await analyticsService.recordImpressions(events);
    } else if (kind === 'clicks') {
      await analyticsService.recordClicks(events);
    } else {
      await analyticsService.recordRevenueEvents(events);
    }
    safeInc(analyticsEventsWrittenTotal, { kind }, events.length);
  } catch (error) {
    safeInc(analyticsEventsFailedTotal, { kind }, events.length);
    throw error;
  }
}

export default processAnalyticsIngest;
