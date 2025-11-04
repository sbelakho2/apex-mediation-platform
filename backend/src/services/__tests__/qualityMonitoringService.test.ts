/**
 * Quality Monitoring Service Tests
 * 
 * Tests for viewability, brand safety, ANR detection, and SLO monitoring
 */

import { qualityMonitoringService } from '../qualityMonitoringService';
import * as clickhouse from '../../utils/clickhouse';

jest.mock('../../utils/clickhouse');
jest.mock('../../utils/logger');

const mockExecuteQuery = clickhouse.executeQuery as jest.MockedFunction<typeof clickhouse.executeQuery>;

describe('QualityMonitoringService', () => {
  const publisherId = '550e8400-e29b-41d4-a716-446655440000';
  const startDate = new Date('2024-01-01');
  const endDate = new Date('2024-01-31');

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getViewabilityMetrics', () => {
    it('should return viewability metrics with format breakdown', async () => {
      mockExecuteQuery
        .mockResolvedValueOnce([
          {
            total_impressions: '100000',
            viewable_impressions: '65000',
            viewability_rate: '65.0',
            avg_view_duration: '3.5',
            measurable_rate: '98.5',
          },
        ])
        .mockResolvedValueOnce([
          {
            ad_format: 'banner',
            viewability_rate: '70.0',
            impressions: '50000',
          },
          {
            ad_format: 'interstitial',
            viewability_rate: '85.0',
            impressions: '30000',
          },
          {
            ad_format: 'rewarded_video',
            viewability_rate: '95.0',
            impressions: '20000',
          },
        ]);

      const result = await qualityMonitoringService.getViewabilityMetrics(
        publisherId,
        startDate,
        endDate
      );

      expect(result).toEqual({
        totalImpressions: 100000,
        viewableImpressions: 65000,
        viewabilityRate: 65.0,
        avgViewDuration: 3.5,
        measurableRate: 98.5,
        byFormat: [
          { format: 'banner', viewabilityRate: 70.0, impressions: 50000 },
          { format: 'interstitial', viewabilityRate: 85.0, impressions: 30000 },
          { format: 'rewarded_video', viewabilityRate: 95.0, impressions: 20000 },
        ],
      });
    });

    it('should handle zero impressions', async () => {
      mockExecuteQuery
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const result = await qualityMonitoringService.getViewabilityMetrics(
        publisherId,
        startDate,
        endDate
      );

      expect(result).toEqual({
        totalImpressions: 0,
        viewableImpressions: 0,
        viewabilityRate: 0,
        avgViewDuration: 0,
        measurableRate: 0,
        byFormat: [],
      });
    });

    it('should verify video formats have higher viewability', async () => {
      mockExecuteQuery
        .mockResolvedValueOnce([
          {
            total_impressions: '100000',
            viewable_impressions: '70000',
            viewability_rate: '70.0',
            avg_view_duration: '4.2',
            measurable_rate: '99.0',
          },
        ])
        .mockResolvedValueOnce([
          { ad_format: 'banner', viewability_rate: '60.0', impressions: '50000' },
          { ad_format: 'rewarded_video', viewability_rate: '98.0', impressions: '50000' },
        ]);

      const result = await qualityMonitoringService.getViewabilityMetrics(
        publisherId,
        startDate,
        endDate
      );

      const bannerViewability = result.byFormat.find(f => f.format === 'banner')?.viewabilityRate;
      const videoViewability = result.byFormat.find(f => f.format === 'rewarded_video')?.viewabilityRate;

      expect(videoViewability).toBeGreaterThan(bannerViewability!);
    });
  });

  describe('getBrandSafetyReport', () => {
    it('should return comprehensive brand safety report', async () => {
      mockExecuteQuery
        .mockResolvedValueOnce([
          {
            total_scans: '10000',
            passed_scans: '9800',
            failed_scans: '200',
            avg_risk_score: '5.5',
          },
        ])
        .mockResolvedValueOnce([
          { blocked_category: 'Adult Content', count: '50' },
          { blocked_category: 'Violence', count: '40' },
          { blocked_category: 'Hate Speech', count: '30' },
        ])
        .mockResolvedValueOnce([
          {
            creative_id: 'creative_123',
            blocked_category: 'Adult Content',
            severity: 'high',
            timestamp: '2024-01-15 10:30:00',
          },
          {
            creative_id: 'creative_456',
            blocked_category: 'Violence',
            severity: 'medium',
            timestamp: '2024-01-15 09:15:00',
          },
        ]);

      const result = await qualityMonitoringService.getBrandSafetyReport(
        publisherId,
        startDate,
        endDate
      );

      expect(result).toEqual({
        totalCreativeScans: 10000,
        passedScans: 9800,
        failedScans: 200,
        blockedCategories: [
          { category: 'Adult Content', count: 50 },
          { category: 'Violence', count: 40 },
          { category: 'Hate Speech', count: 30 },
        ],
        riskScore: 5.5,
        violations: [
          {
            creativeId: 'creative_123',
            category: 'Adult Content',
            severity: 'high',
            timestamp: '2024-01-15 10:30:00',
          },
          {
            creativeId: 'creative_456',
            category: 'Violence',
            severity: 'medium',
            timestamp: '2024-01-15 09:15:00',
          },
        ],
      });
    });

    it('should handle perfect brand safety score', async () => {
      mockExecuteQuery
        .mockResolvedValueOnce([
          {
            total_scans: '5000',
            passed_scans: '5000',
            failed_scans: '0',
            avg_risk_score: '0.0',
          },
        ])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const result = await qualityMonitoringService.getBrandSafetyReport(
        publisherId,
        startDate,
        endDate
      );

      expect(result.failedScans).toBe(0);
      expect(result.riskScore).toBe(0);
      expect(result.violations).toEqual([]);
    });

    it('should prioritize high-severity violations', async () => {
      mockExecuteQuery
        .mockResolvedValueOnce([
          {
            total_scans: '1000',
            passed_scans: '900',
            failed_scans: '100',
            avg_risk_score: '15.0',
          },
        ])
        .mockResolvedValueOnce([
          { blocked_category: 'Adult Content', count: '100' },
        ])
        .mockResolvedValueOnce([
          {
            creative_id: 'creative_789',
            blocked_category: 'Adult Content',
            severity: 'high',
            timestamp: '2024-01-15 14:00:00',
          },
        ]);

      const result = await qualityMonitoringService.getBrandSafetyReport(
        publisherId,
        startDate,
        endDate
      );

      expect(result.violations[0].severity).toBe('high');
    });
  });

  describe('getCreativeComplianceReport', () => {
    it('should return creative compliance metrics', async () => {
      mockExecuteQuery.mockResolvedValueOnce([
        {
          total_creatives: '500',
          compliant_creatives: '450',
          compliance_rate: '90.0',
          violations_list: [
            ['creative_111', 'File size exceeded', 'flagged'],
            ['creative_222', 'Invalid dimensions', 'reviewed'],
            ['creative_333', 'Content policy violation', 'rejected'],
          ],
        },
      ]);

      const result = await qualityMonitoringService.getCreativeComplianceReport(
        publisherId,
        startDate,
        endDate
      );

      expect(result).toEqual({
        totalCreatives: 500,
        compliantCreatives: 450,
        complianceRate: 90.0,
        violations: [
          {
            creativeId: 'creative_111',
            violationType: 'File size exceeded',
            details: 'File size exceeded',
            status: 'flagged',
          },
          {
            creativeId: 'creative_222',
            violationType: 'Invalid dimensions',
            details: 'Invalid dimensions',
            status: 'reviewed',
          },
          {
            creativeId: 'creative_333',
            violationType: 'Content policy violation',
            details: 'Content policy violation',
            status: 'rejected',
          },
        ],
      });
    });

    it('should handle 100% compliance', async () => {
      mockExecuteQuery.mockResolvedValueOnce([
        {
          total_creatives: '1000',
          compliant_creatives: '1000',
          compliance_rate: '100.0',
          violations_list: [],
        },
      ]);

      const result = await qualityMonitoringService.getCreativeComplianceReport(
        publisherId,
        startDate,
        endDate
      );

      expect(result.complianceRate).toBe(100.0);
      expect(result.violations).toEqual([]);
    });
  });

  describe('getANRReport', () => {
    it('should return comprehensive ANR and crash report', async () => {
      mockExecuteQuery
        .mockResolvedValueOnce([
          {
            total_sessions: '100000',
            anr_count: '15',
            anr_rate: '0.015',
            crash_count: '5',
            crash_rate: '0.005',
          },
        ])
        .mockResolvedValueOnce([
          {
            adapter_id: 'unity',
            adapter_name: 'Unity Ads',
            anr_count: '10',
            rate: '0.01',
          },
          {
            adapter_id: 'ironsource',
            adapter_name: 'IronSource',
            anr_count: '5',
            rate: '0.005',
          },
        ])
        .mockResolvedValueOnce([
          {
            stack_trace: 'android.os.NetworkOnMainThreadException at com.unity...',
            count: '8',
            last_seen: '2024-01-15 14:30:00',
          },
          {
            stack_trace: 'java.lang.OutOfMemoryError at com.ironsource...',
            count: '3',
            last_seen: '2024-01-15 12:00:00',
          },
        ]);

      const result = await qualityMonitoringService.getANRReport(
        publisherId,
        startDate,
        endDate
      );

      expect(result).toEqual({
        totalSessions: 100000,
        anrCount: 15,
        anrRate: 0.015,
        crashCount: 5,
        crashRate: 0.005,
        anrsByAdapter: [
          {
            adapterId: 'unity',
            adapterName: 'Unity Ads',
            anrCount: 10,
            rate: 0.01,
          },
          {
            adapterId: 'ironsource',
            adapterName: 'IronSource',
            anrCount: 5,
            rate: 0.005,
          },
        ],
        topIssues: expect.arrayContaining([
          expect.objectContaining({
            count: 8,
            lastSeen: '2024-01-15 14:30:00',
          }),
        ]),
      });
    });

    it('should meet ANR rate target of <0.02%', async () => {
      mockExecuteQuery
        .mockResolvedValueOnce([
          {
            total_sessions: '100000',
            anr_count: '10',
            anr_rate: '0.010',
            crash_count: '3',
            crash_rate: '0.003',
          },
        ])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const result = await qualityMonitoringService.getANRReport(
        publisherId,
        startDate,
        endDate
      );

      expect(result.anrRate).toBeLessThan(0.02);
    });

    it('should identify problematic adapters', async () => {
      mockExecuteQuery
        .mockResolvedValueOnce([
          {
            total_sessions: '50000',
            anr_count: '50',
            anr_rate: '0.10',
            crash_count: '10',
            crash_rate: '0.02',
          },
        ])
        .mockResolvedValueOnce([
          {
            adapter_id: 'problematic_adapter',
            adapter_name: 'Problematic Ad Network',
            anr_count: '45',
            rate: '0.09',
          },
        ])
        .mockResolvedValueOnce([]);

      const result = await qualityMonitoringService.getANRReport(
        publisherId,
        startDate,
        endDate
      );

      expect(result.anrsByAdapter[0].rate).toBeGreaterThan(0.05);
      expect(result.anrsByAdapter[0].adapterName).toBe('Problematic Ad Network');
    });

    it('should handle zero ANRs', async () => {
      mockExecuteQuery
        .mockResolvedValueOnce([
          {
            total_sessions: '100000',
            anr_count: '0',
            anr_rate: '0.0',
            crash_count: '0',
            crash_rate: '0.0',
          },
        ])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const result = await qualityMonitoringService.getANRReport(
        publisherId,
        startDate,
        endDate
      );

      expect(result.anrRate).toBe(0);
      expect(result.crashRate).toBe(0);
    });
  });

  describe('getPerformanceSLOs', () => {
    it('should return healthy SLO status', async () => {
      mockExecuteQuery.mockResolvedValueOnce([
        {
          availability: '99.95',
          latency_slo: '98.5',
          error_rate: '0.3',
          anr_rate: '0.012',
          viewability: '68.0',
        },
      ]);

      const result = await qualityMonitoringService.getPerformanceSLOs(publisherId, 24);

      expect(result.availability.status).toBe('healthy');
      expect(result.latency.status).toBe('healthy');
      expect(result.errorRate.status).toBe('healthy');
      expect(result.anrRate.status).toBe('healthy');
      expect(result.viewability.status).toBe('healthy');
    });

    it('should detect SLO breaches', async () => {
      mockExecuteQuery.mockResolvedValueOnce([
        {
          availability: '98.5', // Below 99.9% target
          latency_slo: '92.0', // Below 95% target
          error_rate: '2.5', // Above 1% target
          anr_rate: '0.035', // Above 0.02% target
          viewability: '45.0', // Below 60% target
        },
      ]);

      const result = await qualityMonitoringService.getPerformanceSLOs(publisherId, 24);

      expect(result.availability.status).toBe('breached');
      expect(result.latency.status).toBe('breached');
      expect(result.errorRate.status).toBe('breached');
      expect(result.anrRate.status).toBe('breached');
      expect(result.viewability.status).toBe('breached');
    });

    it('should calculate error budget correctly', async () => {
      mockExecuteQuery.mockResolvedValueOnce([
        {
          availability: '99.85',
          latency_slo: '95.0',
          error_rate: '1.0',
          anr_rate: '0.02',
          viewability: '60.0',
        },
      ]);

      const result = await qualityMonitoringService.getPerformanceSLOs(publisherId, 24);

      // Availability: target 99.9%, actual 99.85%
      // Error budget: 0.1%, actual error: 0.15%, so it's breached
      expect(result.availability.errorBudget).toBeCloseTo(0.1, 1);
      expect(result.availability.status).toBe('breached'); // Below target
    });

    it('should handle at-risk status with low error budget', async () => {
      mockExecuteQuery.mockResolvedValueOnce([
        {
          availability: '99.92', // Close to 99.9% target
          latency_slo: '95.5',
          error_rate: '0.8',
          anr_rate: '0.018',
          viewability: '61.0',
        },
      ]);

      const result = await qualityMonitoringService.getPerformanceSLOs(publisherId, 24);

      // Should be at-risk due to being close to SLO target
      expect(result.availability.status).toBe('at-risk');
      expect(result.availability.errorBudgetRemaining).toBeLessThan(100);
    });
  });

  describe('getQualityAlerts', () => {
    it('should generate alerts for SLO breaches', async () => {
      // Mock SLO breach
      mockExecuteQuery.mockResolvedValueOnce([
        {
          availability: '98.0', // Breached
          latency_slo: '98.0',
          error_rate: '0.5',
          anr_rate: '0.01',
          viewability: '65.0',
        },
      ]);

      // Mock ANR report
      mockExecuteQuery
        .mockResolvedValueOnce([
          {
            total_sessions: '100000',
            anr_count: '10',
            anr_rate: '0.01',
            crash_count: '5',
            crash_rate: '0.005',
          },
        ])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      // Mock viewability metrics
      mockExecuteQuery
        .mockResolvedValueOnce([
          {
            total_impressions: '100000',
            viewable_impressions: '65000',
            viewability_rate: '65.0',
            avg_view_duration: '3.5',
            measurable_rate: '98.5',
          },
        ])
        .mockResolvedValueOnce([]);

      // Mock brand safety
      mockExecuteQuery
        .mockResolvedValueOnce([
          {
            total_scans: '10000',
            passed_scans: '9950',
            failed_scans: '50',
            avg_risk_score: '2.5',
          },
        ])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const result = await qualityMonitoringService.getQualityAlerts(publisherId, 24);

      const sloAlert = result.find(a => a.alertType === 'slo_breach');
      expect(sloAlert).toBeDefined();
      expect(sloAlert?.severity).toBe('critical');
    });

    it('should generate ANR spike alerts', async () => {
      // Mock healthy SLOs
      mockExecuteQuery.mockResolvedValueOnce([
        {
          availability: '99.95',
          latency_slo: '98.0',
          error_rate: '0.3',
          anr_rate: '0.045', // Above 0.02% threshold
          viewability: '65.0',
        },
      ]);

      // Mock high ANR rate
      mockExecuteQuery
        .mockResolvedValueOnce([
          {
            total_sessions: '100000',
            anr_count: '45',
            anr_rate: '0.045',
            crash_count: '10',
            crash_rate: '0.01',
          },
        ])
        .mockResolvedValueOnce([
          {
            adapter_id: 'problematic',
            adapter_name: 'Problematic Network',
            anr_count: '40',
            rate: '0.04',
          },
        ])
        .mockResolvedValueOnce([]);

      // Mock viewability metrics
      mockExecuteQuery
        .mockResolvedValueOnce([
          {
            total_impressions: '100000',
            viewable_impressions: '65000',
            viewability_rate: '65.0',
            avg_view_duration: '3.5',
            measurable_rate: '98.5',
          },
        ])
        .mockResolvedValueOnce([]);

      // Mock brand safety
      mockExecuteQuery
        .mockResolvedValueOnce([
          {
            total_scans: '10000',
            passed_scans: '9950',
            failed_scans: '50',
            avg_risk_score: '2.5',
          },
        ])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const result = await qualityMonitoringService.getQualityAlerts(publisherId, 24);

      const anrAlert = result.find(a => a.alertType === 'anr_spike');
      expect(anrAlert).toBeDefined();
      expect(anrAlert?.currentValue).toBe(0.045);
      expect(anrAlert?.affectedAdapters).toContain('Problematic Network');
    });

    it('should generate viewability drop alerts', async () => {
      // Mock healthy SLOs
      mockExecuteQuery.mockResolvedValueOnce([
        {
          availability: '99.95',
          latency_slo: '98.0',
          error_rate: '0.3',
          anr_rate: '0.01',
          viewability: '45.0', // Below 60% threshold
        },
      ]);

      // Mock ANR report
      mockExecuteQuery
        .mockResolvedValueOnce([
          {
            total_sessions: '100000',
            anr_count: '10',
            anr_rate: '0.01',
            crash_count: '5',
            crash_rate: '0.005',
          },
        ])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      // Mock low viewability
      mockExecuteQuery
        .mockResolvedValueOnce([
          {
            total_impressions: '100000',
            viewable_impressions: '45000',
            viewability_rate: '45.0',
            avg_view_duration: '2.5',
            measurable_rate: '95.0',
          },
        ])
        .mockResolvedValueOnce([]);

      // Mock brand safety
      mockExecuteQuery
        .mockResolvedValueOnce([
          {
            total_scans: '10000',
            passed_scans: '9950',
            failed_scans: '50',
            avg_risk_score: '2.5',
          },
        ])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const result = await qualityMonitoringService.getQualityAlerts(publisherId, 24);

      const viewabilityAlert = result.find(a => a.alertType === 'viewability_drop');
      expect(viewabilityAlert).toBeDefined();
      expect(viewabilityAlert?.currentValue).toBe(45.0);
      expect(viewabilityAlert?.threshold).toBe(60);
    });

    it('should sort alerts by severity', async () => {
      // Mock multiple issues
      mockExecuteQuery.mockResolvedValueOnce([
        {
          availability: '98.0', // Critical
          latency_slo: '98.0',
          error_rate: '0.3',
          anr_rate: '0.025', // Medium
          viewability: '55.0', // Medium
        },
      ]);

      mockExecuteQuery
        .mockResolvedValueOnce([
          {
            total_sessions: '100000',
            anr_count: '25',
            anr_rate: '0.025',
            crash_count: '5',
            crash_rate: '0.005',
          },
        ])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      mockExecuteQuery
        .mockResolvedValueOnce([
          {
            total_impressions: '100000',
            viewable_impressions: '55000',
            viewability_rate: '55.0',
            avg_view_duration: '3.0',
            measurable_rate: '97.0',
          },
        ])
        .mockResolvedValueOnce([]);

      mockExecuteQuery
        .mockResolvedValueOnce([
          {
            total_scans: '10000',
            passed_scans: '9950',
            failed_scans: '50',
            avg_risk_score: '2.5',
          },
        ])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const result = await qualityMonitoringService.getQualityAlerts(publisherId, 24);

      // Should be sorted by severity (critical first)
      expect(result[0].severity).toBe('critical');
    });

    it('should return empty array when no issues', async () => {
      // Mock perfect metrics
      mockExecuteQuery.mockResolvedValueOnce([
        {
          availability: '99.99',
          latency_slo: '99.0',
          error_rate: '0.1',
          anr_rate: '0.005',
          viewability: '75.0',
        },
      ]);

      mockExecuteQuery
        .mockResolvedValueOnce([
          {
            total_sessions: '100000',
            anr_count: '5',
            anr_rate: '0.005',
            crash_count: '2',
            crash_rate: '0.002',
          },
        ])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      mockExecuteQuery
        .mockResolvedValueOnce([
          {
            total_impressions: '100000',
            viewable_impressions: '75000',
            viewability_rate: '75.0',
            avg_view_duration: '4.0',
            measurable_rate: '99.0',
          },
        ])
        .mockResolvedValueOnce([]);

      mockExecuteQuery
        .mockResolvedValueOnce([
          {
            total_scans: '10000',
            passed_scans: '10000',
            failed_scans: '0',
            avg_risk_score: '0.0',
          },
        ])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const result = await qualityMonitoringService.getQualityAlerts(publisherId, 24);

      expect(result).toEqual([]);
    });
  });
});
