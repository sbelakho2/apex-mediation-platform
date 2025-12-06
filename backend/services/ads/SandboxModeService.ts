// services/ads/SandboxModeService.ts
// Provides mock ad responses for customers during cold start (before ad networks integrated)
// Enables immediate SDK testing without real ad network partnerships

import { Pool } from 'pg';

interface AdRequest {
  customerId: string;
  placementId: string;
  adFormat: 'banner' | 'interstitial' | 'rewarded_video' | 'native';
  deviceInfo: {
    platform: 'ios' | 'android' | 'unity';
    osVersion: string;
    deviceModel: string;
    screenSize: string;
  };
}

interface MockAdResponse {
  adId: string;
  network: 'sandbox';
  format: string;
  creative: {
    imageUrl?: string;
    videoUrl?: string;
    clickUrl: string;
    width: number;
    height: number;
    duration?: number; // For video ads
  };
  impressionTracking: string[];
  clickTracking: string[];
  metadata: {
    isSandbox: true;
    message: string;
    nextSteps: string[];
  };
}

export class SandboxModeService {
  private pool: Pool;

  constructor(databaseUrl: string) {
    this.pool = new Pool({ connectionString: databaseUrl });
  }

  /**
   * Check if customer is in sandbox mode
   * Customer is in sandbox mode if:
   * 1. Account age < 30 days AND no live ad networks connected
   * 2. Manual sandbox flag enabled (for testing)
   */
  async isInSandboxMode(customerId: string): Promise<boolean> {
    const result = await this.pool.query(
      `SELECT 
         u.created_at,
         COALESCE(s.sandbox_mode, false) as manual_sandbox,
         COUNT(an.id) as active_networks
       FROM users u
       LEFT JOIN subscriptions s ON u.id = s.customer_id
       LEFT JOIN ad_networks an ON an.customer_id = u.id AND an.status = 'active'
       WHERE u.id = $1
       GROUP BY u.created_at, s.sandbox_mode`,
      [customerId]
    );

    if (result.rows.length === 0) {
      return false;
    }

    const { created_at, manual_sandbox, active_networks } = result.rows[0];
    const accountAgeDays = Math.floor(
      (Date.now() - new Date(created_at).getTime()) / (1000 * 60 * 60 * 24)
    );

    // Sandbox mode if manually enabled OR (account < 30 days old AND no live networks)
    return manual_sandbox || (accountAgeDays < 30 && active_networks === 0);
  }

  /**
   * Generate mock ad response for testing
   */
  async getMockAd(request: AdRequest): Promise<MockAdResponse> {
    const isSandbox = await this.isInSandboxMode(request.customerId);

    if (!isSandbox) {
      throw new Error('Customer not in sandbox mode');
    }

    // Log sandbox ad request for analytics
    await this.logSandboxRequest(request);

    // Generate mock ad based on format
    const adId = `sandbox_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    switch (request.adFormat) {
      case 'banner':
        return this.generateMockBanner(adId, request);
      case 'interstitial':
        return this.generateMockInterstitial(adId, request);
      case 'rewarded_video':
        return this.generateMockRewardedVideo(adId, request);
      case 'native':
        return this.generateMockNative(adId, request);
      default:
        throw new Error(`Unsupported ad format: ${request.adFormat}`);
    }
  }

  /**
   * Generate mock banner ad (300x250 or 320x50)
   */
  private generateMockBanner(adId: string, request: AdRequest): MockAdResponse {
    const sizes = [
      { width: 320, height: 50 },
      { width: 300, height: 250 },
      { width: 728, height: 90 }, // Tablet
    ];

    const size = sizes[Math.floor(Math.random() * sizes.length)];

    return {
      adId,
      network: 'sandbox',
      format: 'banner',
      creative: {
        imageUrl: `https://apexmediation.ee/sandbox/banner/${size.width}x${size.height}.png`,
        clickUrl: 'https://apexmediation.ee/sandbox/click',
        width: size.width,
        height: size.height,
      },
      impressionTracking: [`https://apexmediation.ee/sandbox/impression/${adId}`],
      clickTracking: [`https://apexmediation.ee/sandbox/click/${adId}`],
      metadata: {
        isSandbox: true,
        message: '🧪 Sandbox Mode: Test ad (no real ad networks connected yet)',
        nextSteps: [
          'Contact founder to set up your first ad network (AdMob, Unity, or Meta)',
          'Your SDK integration is working perfectly!',
          'Real ads will flow once networks are connected (3-5 days)',
        ],
      },
    };
  }

  /**
   * Generate mock interstitial ad (full-screen)
   */
  private generateMockInterstitial(adId: string, request: AdRequest): MockAdResponse {
    const { platform, screenSize } = request.deviceInfo;

    // Parse screen size (e.g., "1920x1080")
    const [width, height] = screenSize.split('x').map(Number);

    return {
      adId,
      network: 'sandbox',
      format: 'interstitial',
      creative: {
        imageUrl: `https://apexmediation.ee/sandbox/interstitial/${width}x${height}.png`,
        clickUrl: 'https://apexmediation.ee/sandbox/click',
        width,
        height,
      },
      impressionTracking: [`https://apexmediation.ee/sandbox/impression/${adId}`],
      clickTracking: [`https://apexmediation.ee/sandbox/click/${adId}`],
      metadata: {
        isSandbox: true,
        message: '🧪 Sandbox Mode: Full-screen test ad',
        nextSteps: [
          'Your interstitial ad logic is working correctly',
          'Email contact@apexmediation.ee to connect real ad networks',
          'Platform ready for production when you are',
        ],
      },
    };
  }

  /**
   * Generate mock rewarded video ad
   */
  private generateMockRewardedVideo(adId: string, request: AdRequest): MockAdResponse {
    return {
      adId,
      network: 'sandbox',
      format: 'rewarded_video',
      creative: {
        videoUrl: 'https://apexmediation.ee/sandbox/video/rewarded_30s.mp4',
        clickUrl: 'https://apexmediation.ee/sandbox/click',
        width: 1920,
        height: 1080,
        duration: 30, // 30-second video
      },
      impressionTracking: [
        `https://apexmediation.ee/sandbox/impression/${adId}`,
        `https://apexmediation.ee/sandbox/video_start/${adId}`,
        `https://apexmediation.ee/sandbox/video_complete/${adId}`,
      ],
      clickTracking: [`https://apexmediation.ee/sandbox/click/${adId}`],
      metadata: {
        isSandbox: true,
        message: '🧪 Sandbox Mode: Rewarded video test ad (30s)',
        nextSteps: [
          'Your reward logic can trigger after video completion',
          'Contact founder to integrate Unity Ads or Meta for real rewarded videos',
          'Rewarded videos typically generate 2-5x revenue vs banners',
        ],
      },
    };
  }

  /**
   * Generate mock native ad
   */
  private generateMockNative(adId: string, request: AdRequest): MockAdResponse {
    return {
      adId,
      network: 'sandbox',
      format: 'native',
      creative: {
        imageUrl: 'https://apexmediation.ee/sandbox/native/icon_1200x627.png',
        clickUrl: 'https://apexmediation.ee/sandbox/click',
        width: 1200,
        height: 627,
      },
      impressionTracking: [`https://apexmediation.ee/sandbox/impression/${adId}`],
      clickTracking: [`https://apexmediation.ee/sandbox/click/${adId}`],
      metadata: {
        isSandbox: true,
        message: '🧪 Sandbox Mode: Native ad test',
        nextSteps: [
          'Native ads blend seamlessly with your app UI',
          'Contact founder to connect real native ad providers',
          'Native ads often achieve 2-3x CTR vs banner ads',
        ],
      },
    };
  }

  /**
   * Log sandbox ad request for analytics
   */
  private async logSandboxRequest(request: AdRequest): Promise<void> {
    await this.pool.query(
      `INSERT INTO sandbox_requests (
         customer_id,
         placement_id,
         ad_format,
         platform,
         os_version,
         device_model,
         created_at
       ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
       ON CONFLICT DO NOTHING`,
      [
        request.customerId,
        request.placementId,
        request.adFormat,
        request.deviceInfo.platform,
        request.deviceInfo.osVersion,
        request.deviceInfo.deviceModel,
      ]
    );

    // Increment test impression counter (for dashboard analytics)
    await this.pool.query(
      `INSERT INTO usage_records (
         customer_id,
         impressions,
         ad_requests,
         is_sandbox,
         created_at
       ) VALUES ($1, 1, 1, true, NOW())
       ON CONFLICT (customer_id, date_trunc('day', created_at))
       DO UPDATE SET
         impressions = usage_records.impressions + 1,
         ad_requests = usage_records.ad_requests + 1`,
      [request.customerId]
    );
  }

  /**
   * Get sandbox analytics for customer
   */
  async getSandboxAnalytics(customerId: string): Promise<{
    totalRequests: number;
    requestsByFormat: Record<string, number>;
    requestsByPlatform: Record<string, number>;
    averageRequestsPerDay: number;
    readyForProduction: boolean;
    nextSteps: string[];
  }> {
    // Get total sandbox requests
    const totalResult = await this.pool.query(
      `SELECT COUNT(*) as total FROM sandbox_requests WHERE customer_id = $1`,
      [customerId]
    );

    // Get requests by format
    const formatResult = await this.pool.query(
      `SELECT ad_format, COUNT(*) as count
       FROM sandbox_requests
       WHERE customer_id = $1
       GROUP BY ad_format`,
      [customerId]
    );

    // Get requests by platform
    const platformResult = await this.pool.query(
      `SELECT platform, COUNT(*) as count
       FROM sandbox_requests
       WHERE customer_id = $1
       GROUP BY platform`,
      [customerId]
    );

    // Get account age
    const accountResult = await this.pool.query(
      `SELECT created_at FROM users WHERE id = $1`,
      [customerId]
    );

    const totalRequests = parseInt(totalResult.rows[0]?.total || '0');
    const accountAgeDays = Math.floor(
      (Date.now() - new Date(accountResult.rows[0].created_at).getTime()) /
        (1000 * 60 * 60 * 24)
    );

    const requestsByFormat: Record<string, number> = {};
    formatResult.rows.forEach((row) => {
      requestsByFormat[row.ad_format] = parseInt(row.count);
    });

    const requestsByPlatform: Record<string, number> = {};
    platformResult.rows.forEach((row) => {
      requestsByPlatform[row.platform] = parseInt(row.count);
    });

    const averageRequestsPerDay =
      accountAgeDays > 0 ? totalRequests / accountAgeDays : totalRequests;

    // Determine if ready for production (100+ test requests or 7+ days active)
    const readyForProduction = totalRequests >= 100 || accountAgeDays >= 7;

    const nextSteps: string[] = [];
    if (!readyForProduction) {
      nextSteps.push(
        `Complete ${100 - totalRequests} more test ad requests to validate integration`
      );
    }
    if (accountAgeDays < 7) {
      nextSteps.push(
        `Continue testing for ${7 - accountAgeDays} more days to ensure stability`
      );
    }
    if (readyForProduction) {
      nextSteps.push(
        'Your integration is ready! Email contact@apexmediation.ee to connect your first ad network (AdMob recommended)'
      );
      nextSteps.push(
        'We can have live ads flowing within 24-48 hours of first contact'
      );
      nextSteps.push(
        'Expected revenue: $5-50/1000 impressions depending on ad format and geography'
      );
    }

    return {
      totalRequests,
      requestsByFormat,
      requestsByPlatform,
      averageRequestsPerDay: Math.round(averageRequestsPerDay * 10) / 10,
      readyForProduction,
      nextSteps,
    };
  }

  /**
   * Enable/disable sandbox mode manually (for testing or troubleshooting)
   */
  async setSandboxMode(customerId: string, enabled: boolean): Promise<void> {
    await this.pool.query(
      `UPDATE subscriptions SET sandbox_mode = $1 WHERE customer_id = $2`,
      [enabled, customerId]
    );

    console.log(
      `[Sandbox] ${enabled ? 'Enabled' : 'Disabled'} sandbox mode for customer ${customerId}`
    );
  }

  /**
   * Notify founder when customer is ready to exit sandbox
   */
  async notifyFounderReadyForProduction(customerId: string): Promise<void> {
    const analytics = await this.getSandboxAnalytics(customerId);

    if (!analytics.readyForProduction) {
      return;
    }

    // Check if we've already sent notification
    const existingNotification = await this.pool.query(
      `SELECT id FROM events
       WHERE event_type = 'founder.sandbox_ready'
         AND data->>'customer_id' = $1
         AND created_at >= NOW() - INTERVAL '7 days'`,
      [customerId]
    );

    if (existingNotification.rows.length > 0) {
      return; // Already notified in past 7 days
    }

    // Get customer details
    const customerResult = await this.pool.query(
      `SELECT email, created_at FROM users WHERE id = $1`,
      [customerId]
    );

    const customer = customerResult.rows[0];

    // Emit founder notification event
    await this.pool.query(
      `INSERT INTO events (event_type, data, created_at)
       VALUES ('founder.sandbox_ready', $1, NOW())`,
      [
        JSON.stringify({
          customer_id: customerId,
          email: customer.email,
          account_age_days: Math.floor(
            (Date.now() - new Date(customer.created_at).getTime()) /
              (1000 * 60 * 60 * 24)
          ),
          total_test_requests: analytics.totalRequests,
          requests_by_format: analytics.requestsByFormat,
          requests_by_platform: analytics.requestsByPlatform,
          message: `Customer ${customerId} (${customer.email}) is ready to exit sandbox mode!`,
          action_required:
            'Email customer to schedule 15-min call for first ad network setup (AdMob recommended)',
        }),
      ]
    );

    console.log(
      `[Sandbox] Notified founder: Customer ${customerId} ready for production`
    );
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

// Export singleton instance
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL environment variable is required');
}
export const sandboxModeService = new SandboxModeService(databaseUrl);

// CLI support: node -r ts-node/register SandboxModeService.ts <customer_id>
if (require.main === module) {
  const customerId = process.argv[2];
  if (!customerId) {
    console.error('Usage: node SandboxModeService.ts <customer_id>');
    process.exit(1);
  }

  (async () => {
    const service = new SandboxModeService(databaseUrl!);
    try {
      const isSandbox = await service.isInSandboxMode(customerId);
      console.log(`Customer ${customerId} sandbox mode: ${isSandbox}`);

      if (isSandbox) {
        const analytics = await service.getSandboxAnalytics(customerId);
        console.log('Sandbox Analytics:', JSON.stringify(analytics, null, 2));
      }

      await service.close();
      process.exit(0);
    } catch (error) {
      console.error('Error:', error);
      await service.close();
      process.exit(1);
    }
  })();
}
