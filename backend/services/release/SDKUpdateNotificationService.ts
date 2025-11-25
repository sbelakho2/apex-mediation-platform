import { Pool } from 'pg';
import { ChangelogGenerationService, ReleaseNotes } from './ChangelogGenerationService';

/**
 * Service for notifying customers about SDK updates
 * Integrates with existing EmailAutomationService via events table
 */
export class SDKUpdateNotificationService {
  private readonly pool: Pool;
  private readonly changelogService: ChangelogGenerationService;

  constructor(databaseUrl: string, repoPath?: string) {
    this.pool = new Pool({
      connectionString: databaseUrl,
    });
    this.changelogService = new ChangelogGenerationService(repoPath);
  }

  /**
   * Notify all active customers about SDK update
   */
  async notifyCustomers(version: string): Promise<void> {
    console.log(`📧 Notifying customers about v${version}...`);

    // Get release notes
    const releaseNotes = await this.changelogService.getReleaseNotes(version);

    // Get all active customers
    const customers = await this.getActiveCustomers();
    console.log(`Found ${customers.length} active customers`);

    // Emit email event for each customer
    for (const customer of customers) {
      await this.emitSDKUpdateEmail(customer, releaseNotes);
    }

    console.log(`✅ Emitted ${customers.length} SDK update email events`);
  }

  /**
   * Get all active customers (have active subscription)
   */
  private async getActiveCustomers(): Promise<Array<{
    customer_id: string;
    email: string;
    company_name?: string;
  }>> {
    const result = await this.pool.query(`
      SELECT DISTINCT
        c.id as customer_id,
        c.email,
        c.company_name
      FROM customers c
      INNER JOIN subscriptions s ON c.id = s.customer_id
      WHERE s.status = 'active'
        AND s.suspended_at IS NULL
      ORDER BY c.created_at ASC
    `);

    return result.rows;
  }

  /**
   * Emit SDK update email event
   */
  private async emitSDKUpdateEmail(
    customer: { customer_id: string; email: string; company_name?: string },
    releaseNotes: ReleaseNotes
  ): Promise<void> {
    const eventData = {
      to: customer.email,
      customer_id: customer.customer_id,
      company_name: customer.company_name,
      version: releaseNotes.version,
      breaking_changes: releaseNotes.breaking_changes,
      changelog: releaseNotes.raw_changelog,
      changelog_html: this.changelogService.formatForEmail(releaseNotes),
      migration_guide_url: releaseNotes.breaking_changes
        ? `https://docs.apexmediation.ee/migration/v${releaseNotes.version}`
        : undefined,
      release_url: `https://github.com/apexmediation/platform/releases/tag/v${releaseNotes.version}`,
      docs_urls: {
        ios: 'https://docs.apexmediation.ee/ios',
        android: 'https://docs.apexmediation.ee/android',
        unity: 'https://docs.apexmediation.ee/unity',
      },
    };

    await this.pool.query(
      `INSERT INTO events (event_type, data, created_at)
       VALUES ($1, $2, NOW())`,
      ['email.sdk_update', JSON.stringify(eventData)]
    );
  }

  /**
   * Create in-console notification for SDK update
   */
  async createConsoleNotification(version: string): Promise<void> {
    console.log(`🔔 Creating console notifications for v${version}...`);

    const releaseNotes = await this.changelogService.getReleaseNotes(version);
    const customers = await this.getActiveCustomers();

    for (const customer of customers) {
      await this.pool.query(
        `INSERT INTO notifications (
          customer_id, 
          type, 
          title, 
          message, 
          action_url,
          priority,
          created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
        [
          customer.customer_id,
          'sdk_update',
          `SDK v${version} Released`,
          releaseNotes.breaking_changes
            ? `New SDK version available with breaking changes. Please review the migration guide.`
            : `New SDK version available with improvements and bug fixes.`,
          `https://github.com/apexmediation/platform/releases/tag/v${version}`,
          releaseNotes.breaking_changes ? 'high' : 'normal',
        ]
      );
    }

    console.log(`✅ Created ${customers.length} console notifications`);
  }

  /**
   * Check if customers are using deprecated APIs
   * This would integrate with backend telemetry to detect usage
   */
  async notifyDeprecatedAPIUsers(
    deprecatedAPI: string,
    deprecationDate: Date,
    removalVersion: string
  ): Promise<void> {
    console.log(`⚠️ Notifying customers using deprecated API: ${deprecatedAPI}...`);

    // Query for customers using the deprecated API
    // This assumes we have API usage tracking in place
    const result = await this.pool.query(`
      SELECT DISTINCT
        c.id as customer_id,
        c.email,
        c.company_name
      FROM customers c
      INNER JOIN api_usage_logs l ON c.id = l.customer_id
      WHERE l.endpoint = $1
        AND l.created_at >= NOW() - INTERVAL '30 days'
    `, [deprecatedAPI]);

    const affectedCustomers = result.rows;
    console.log(`Found ${affectedCustomers.length} customers using deprecated API`);

    if (affectedCustomers.length === 0) {
      console.log('✅ No customers affected');
      return;
    }

    // Emit deprecation warning emails
    for (const customer of affectedCustomers) {
      const eventData = {
        to: customer.email,
        customer_id: customer.customer_id,
        company_name: customer.company_name,
        deprecated_api: deprecatedAPI,
        deprecation_date: deprecationDate.toISOString().split('T')[0],
        removal_version: removalVersion,
        migration_docs_url: `https://docs.apexmediation.ee/migration/deprecated/${deprecatedAPI}`,
      };

      await this.pool.query(
        `INSERT INTO events (event_type, data, created_at)
         VALUES ($1, $2, NOW())`,
        ['email.api_deprecated', JSON.stringify(eventData)]
      );

      // Also create console notification
      await this.pool.query(
        `INSERT INTO notifications (
          customer_id, 
          type, 
          title, 
          message, 
          action_url,
          priority,
          created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
        [
          customer.customer_id,
          'api_deprecated',
          `Deprecated API: ${deprecatedAPI}`,
          `You're using an API that will be removed in ${removalVersion}. Please update your integration.`,
          `https://docs.apexmediation.ee/migration/deprecated/${deprecatedAPI}`,
          'high',
        ]
      );
    }

    console.log(`✅ Notified ${affectedCustomers.length} affected customers`);
  }

  /**
   * Track SDK adoption rates
   */
  async trackSDKAdoption(version: string): Promise<{
    total_customers: number;
    upgraded_customers: number;
    adoption_rate: number;
  }> {
    // This would integrate with SDK telemetry to track versions in use
    const result = await this.pool.query(`
      SELECT 
        COUNT(DISTINCT customer_id) as total_customers,
        COUNT(DISTINCT CASE WHEN sdk_version = $1 THEN customer_id END) as upgraded_customers
      FROM sdk_telemetry
      WHERE recorded_at >= NOW() - INTERVAL '7 days'
    `, [version]);

    const { total_customers, upgraded_customers } = result.rows[0];
    const adoption_rate = total_customers > 0 
      ? (upgraded_customers / total_customers) * 100 
      : 0;

    return {
      total_customers: parseInt(total_customers),
      upgraded_customers: parseInt(upgraded_customers),
      adoption_rate: Math.round(adoption_rate * 100) / 100,
    };
  }

  /**
   * Send adoption reminder to customers still on old versions
   */
  async sendAdoptionReminder(
    currentVersion: string,
    daysAfterRelease: number = 14
  ): Promise<void> {
    console.log(`📨 Sending adoption reminder for v${currentVersion}...`);

    // Get customers who haven't upgraded yet
    const result = await this.pool.query(`
      SELECT DISTINCT
        c.id as customer_id,
        c.email,
        c.company_name,
        t.sdk_version
      FROM customers c
      INNER JOIN subscriptions s ON c.id = s.customer_id
      LEFT JOIN LATERAL (
        SELECT sdk_version
        FROM sdk_telemetry
        WHERE customer_id = c.id
        ORDER BY recorded_at DESC
        LIMIT 1
      ) t ON true
      WHERE s.status = 'active'
        AND s.suspended_at IS NULL
        AND (t.sdk_version IS NULL OR t.sdk_version != $1)
    `, [currentVersion]);

    const outdatedCustomers = result.rows;
    console.log(`Found ${outdatedCustomers.length} customers on older versions`);

    const releaseNotes = await this.changelogService.getReleaseNotes(currentVersion);

    for (const customer of outdatedCustomers) {
      const eventData = {
        to: customer.email,
        customer_id: customer.customer_id,
        company_name: customer.company_name,
        current_version: customer.sdk_version || 'unknown',
        latest_version: currentVersion,
        days_since_release: daysAfterRelease,
        changelog_html: this.changelogService.formatForEmail(releaseNotes),
        release_url: `https://github.com/apexmediation/platform/releases/tag/v${currentVersion}`,
      };

      await this.pool.query(
        `INSERT INTO events (event_type, data, created_at)
         VALUES ($1, $2, NOW())`,
        ['email.sdk_upgrade_reminder', JSON.stringify(eventData)]
      );
    }

    console.log(`✅ Sent ${outdatedCustomers.length} upgrade reminders`);
  }

  /**
   * Close database connection
   */
  async close(): Promise<void> {
    await this.pool.end();
  }
}

// CLI usage
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command) {
    console.error('Usage: node SDKUpdateNotificationService.js <command> <version>');
    console.error('Commands:');
    console.error('  notify <version>       - Notify all customers about SDK update');
    console.error('  console <version>      - Create console notifications');
    console.error('  adoption <version>     - Check adoption rate');
    console.error('  reminder <version>     - Send upgrade reminder');
    process.exit(1);
  }

  const version = args[1];
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    console.error('❌ DATABASE_URL environment variable required');
    process.exit(1);
  }

  const service = new SDKUpdateNotificationService(databaseUrl);

  (async () => {
    try {
      switch (command) {
        case 'notify':
          if (!version) throw new Error('Version required');
          await service.notifyCustomers(version);
          break;

        case 'console':
          if (!version) throw new Error('Version required');
          await service.createConsoleNotification(version);
          break;

        case 'adoption':
          if (!version) throw new Error('Version required');
          const stats = await service.trackSDKAdoption(version);
          console.log('\n📊 Adoption Statistics:');
          console.log(`Total customers: ${stats.total_customers}`);
          console.log(`Upgraded customers: ${stats.upgraded_customers}`);
          console.log(`Adoption rate: ${stats.adoption_rate}%`);
          break;

        case 'reminder':
          if (!version) throw new Error('Version required');
          await service.sendAdoptionReminder(version, 14);
          break;

        default:
          console.error(`Unknown command: ${command}`);
          process.exit(1);
      }

      await service.close();
      console.log('\n✅ Complete');
      process.exit(0);
    } catch (error) {
      console.error('❌ Error:', error);
      await service.close();
      process.exit(1);
    }
  })();
}
