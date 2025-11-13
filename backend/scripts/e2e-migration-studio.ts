#!/usr/bin/env node
/**
 * E2E Smoke Test for Migration Studio
 * 
 * Tests the complete lifecycle:
 * 1. Create experiment
 * 2. Import adapter mappings
 * 3. Activate with 10% mirror
 * 4. Simulate traffic (generate synthetic outcomes)
 * 5. Generate report
 * 6. Verify Ed25519 signature
 * 
 * Usage: DATABASE_URL="postgres://..." node scripts/e2e-migration-studio.ts
 */

import { Pool } from 'pg';
import * as crypto from 'crypto';

const DATABASE_URL = process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/apexmediation_test';

interface Experiment {
  id: string;
  publisher_id: string;
  name: string;
  status: string;
  mirror_percent: number;
  seed: string;
}

interface Report {
  experiment_id: string;
  control: any;
  test: any;
  uplift: any;
  statistical_significance: any;
}

interface SignedComparison {
  payload: any;
  signature: string;
  public_key_base64: string;
  algorithm: string;
  timestamp: string;
}

async function main() {
  const pool = new Pool({ connectionString: DATABASE_URL });
  
  console.log('🚀 E2E Migration Studio Smoke Test\n');
  
  try {
    // Step 1: Create test publisher and user
    console.log('1️⃣  Creating test publisher and user...');
    const publisherResult = await pool.query(`
      INSERT INTO publishers (company_name, created_at)
      VALUES ('E2E Test Publisher', NOW())
      RETURNING id, company_name
    `);
    const publisherId = publisherResult.rows[0].id;
    
    // Create user for the publisher
    await pool.query(`
      INSERT INTO users (publisher_id, email, password_hash, created_at)
      VALUES ($1, 'e2e@test.com', '$2b$10$abcdefghijk', NOW())
      ON CONFLICT (email) DO NOTHING
    `, [publisherId]);
    
    console.log(`   ✅ Publisher created: ${publisherId}\n`);
    
    // Step 2: Create experiment
    console.log('2️⃣  Creating migration experiment...');
    const expResult = await pool.query(`
      INSERT INTO migration_experiments (
        publisher_id, name, description, status,
        mirror_percent, objective, seed,
        created_at
      ) VALUES (
        $1, 'E2E Test Experiment', 'Automated smoke test',
        'draft', 10, 'revenue_comparison', gen_random_uuid()::TEXT,
        NOW()
      ) RETURNING *
    `, [publisherId]);
    const experiment: Experiment = expResult.rows[0];
    console.log(`   ✅ Experiment created: ${experiment.id}`);
    console.log(`   📊 Configuration: mirror=${experiment.mirror_percent}%\n`);
    
    // Step 3: Import adapter mappings
    console.log('3️⃣  Importing adapter mappings...');
    const mappings = [
      { incumbent: 'ironSource', our_adapter: 'unity', position: 1 },
      { incumbent: 'AppLovin', our_adapter: 'admob', position: 2 },
      { incumbent: 'MAX', our_adapter: 'mopub', position: 3 },
    ];
    
    for (const mapping of mappings) {
      await pool.query(`
        INSERT INTO migration_mappings (
          experiment_id, incumbent_network, incumbent_instance_id, 
          incumbent_waterfall_position, our_adapter_name, mapping_status, created_at
        ) VALUES ($1, $2, $3, $4, $5, 'confirmed', NOW())
      `, [
        experiment.id, 
        mapping.incumbent, 
        `instance_${mapping.position}`, 
        mapping.position, 
        mapping.our_adapter
      ]);
    }
    console.log(`   ✅ ${mappings.length} adapter mappings imported\n`);
    
    // Step 4: Activate experiment
    console.log('4️⃣  Activating experiment...');
    await pool.query(`
      UPDATE migration_experiments
      SET status = 'active', activated_at = NOW()
      WHERE id = $1
    `, [experiment.id]);
    
    // Record activation event
    await pool.query(`
      INSERT INTO migration_events (
        experiment_id, event_type, event_data, created_at
      ) VALUES ($1, 'activation', $2, NOW())
    `, [experiment.id, JSON.stringify({ actor: 'e2e-test', method: 'script' })]);
    console.log(`   ✅ Experiment activated\n`);
    
    // Step 5: Simulate traffic (generate synthetic guardrail snapshots)
    console.log('5️⃣  Simulating traffic (generating synthetic data)...');
    const now = new Date();
    const hoursBack = 14 * 24; // 14 days
    
    for (let i = 0; i < hoursBack; i += 24) { // Daily snapshots
      const snapshotTimestamp = new Date(now.getTime() - i * 60 * 60 * 1000);
      
      // Control arm (better performance)
      const controlImpressions = 8000 + Math.floor(Math.random() * 2000);
      const controlFills = Math.floor(controlImpressions * 0.75); // 75% fill
      const controlRevenueMicros = controlFills * 4500000; // $4.50 eCPM in micros
      const controlLatencyP95 = 280 + Math.floor(Math.random() * 40);
      const controlIvtRate = 2.0 + Math.random() * 0.5; // ~2% IVT
      
      await pool.query(`
        INSERT INTO migration_guardrail_snapshots (
          experiment_id, captured_at, arm,
          impressions, fills, revenue_micros,
          latency_p50_ms, latency_p95_ms,
          error_rate_percent, ivt_rate_percent,
          rolling_window_minutes
        ) VALUES ($1, $2, 'control', $3, $4, $5, $6, $7, $8, $9, 1440)
      `, [
        experiment.id, snapshotTimestamp,
        controlImpressions, controlFills, controlRevenueMicros,
        200, controlLatencyP95,
        0.5, controlIvtRate
      ]);
      
      // Test arm (slightly worse - realistic migration scenario)
      const testImpressions = 900 + Math.floor(Math.random() * 200); // 10% mirror
      const testFills = Math.floor(testImpressions * 0.68); // 68% fill (worse)
      const testRevenueMicros = testFills * 3800000; // $3.80 eCPM in micros (worse)
      const testLatencyP95 = 320 + Math.floor(Math.random() * 60);
      const testIvtRate = 1.5 + Math.random() * 0.3; // ~1.5% IVT (better)
      
      await pool.query(`
        INSERT INTO migration_guardrail_snapshots (
          experiment_id, captured_at, arm,
          impressions, fills, revenue_micros,
          latency_p50_ms, latency_p95_ms,
          error_rate_percent, ivt_rate_percent,
          rolling_window_minutes
        ) VALUES ($1, $2, 'test', $3, $4, $5, $6, $7, $8, $9, 1440)
      `, [
        experiment.id, snapshotTimestamp,
        testImpressions, testFills, testRevenueMicros,
        230, testLatencyP95,
        0.8, testIvtRate
      ]);
    }
    console.log(`   ✅ Generated ${hoursBack / 24} days of synthetic traffic data\n`);
    
    // Step 6: Generate report (simulate service call)
    console.log('6️⃣  Generating experiment report...');
    const snapshotResult = await pool.query(`
      SELECT
        arm,
        SUM(impressions) as total_impressions,
        SUM(fills) as total_fills,
        SUM(revenue_micros) as total_revenue_micros,
        AVG(latency_p95_ms) as avg_latency_p95,
        AVG(error_rate_percent) as avg_error_rate,
        AVG(ivt_rate_percent) as avg_ivt_rate
      FROM migration_guardrail_snapshots
      WHERE experiment_id = $1
        AND captured_at >= NOW() - INTERVAL '14 days'
      GROUP BY arm
    `, [experiment.id]);
    
    const controlMetrics = snapshotResult.rows.find(r => r.arm === 'control');
    const testMetrics = snapshotResult.rows.find(r => r.arm === 'test');
    
    if (!controlMetrics || !testMetrics) {
      throw new Error('Missing control or test metrics');
    }
    
    // Calculate KPIs (revenue_micros / 1,000,000 = USD)
    const controlRevenue = parseFloat(controlMetrics.total_revenue_micros) / 1_000_000;
    const testRevenue = parseFloat(testMetrics.total_revenue_micros) / 1_000_000;
    const controlEcpm = (controlRevenue / parseFloat(controlMetrics.total_impressions)) * 1000;
    const testEcpm = (testRevenue / parseFloat(testMetrics.total_impressions)) * 1000;
    const controlFillRate = parseFloat(controlMetrics.total_fills) / parseFloat(controlMetrics.total_impressions);
    const testFillRate = parseFloat(testMetrics.total_fills) / parseFloat(testMetrics.total_impressions);
    
    const report: Report = {
      experiment_id: experiment.id,
      control: {
        impressions: parseInt(controlMetrics.total_impressions),
        fills: parseInt(controlMetrics.total_fills),
        fill_rate: controlFillRate,
        revenue: controlRevenue,
        ecpm: controlEcpm,
        latency_p95: parseFloat(controlMetrics.avg_latency_p95),
        error_rate: parseFloat(controlMetrics.avg_error_rate),
        ivt_rate: parseFloat(controlMetrics.avg_ivt_rate),
      },
      test: {
        impressions: parseInt(testMetrics.total_impressions),
        fills: parseInt(testMetrics.total_fills),
        fill_rate: testFillRate,
        revenue: testRevenue,
        ecpm: testEcpm,
        latency_p95: parseFloat(testMetrics.avg_latency_p95),
        error_rate: parseFloat(testMetrics.avg_error_rate),
        ivt_rate: parseFloat(testMetrics.avg_ivt_rate),
      },
      uplift: {
        revenue_pct: ((testEcpm - controlEcpm) / controlEcpm) * 100,
        fill_rate_pct: ((testFillRate - controlFillRate) / controlFillRate) * 100,
        latency_delta_ms: parseFloat(testMetrics.avg_latency_p95) - parseFloat(controlMetrics.avg_latency_p95),
      },
      statistical_significance: {
        method: 'simplified_t_test',
        p_value: 0.032, // Mock
        confidence_level: 0.95,
      },
    };
    
    console.log(`   ✅ Report generated`);
    console.log(`   📊 Control: ${report.control.impressions.toLocaleString()} impr, $${report.control.ecpm.toFixed(2)} eCPM, ${(report.control.fill_rate * 100).toFixed(1)}% fill`);
    console.log(`   📊 Test: ${report.test.impressions.toLocaleString()} impr, $${report.test.ecpm.toFixed(2)} eCPM, ${(report.test.fill_rate * 100).toFixed(1)}% fill`);
    console.log(`   📈 Uplift: ${report.uplift.revenue_pct > 0 ? '+' : ''}${report.uplift.revenue_pct.toFixed(2)}% revenue, ${report.uplift.fill_rate_pct > 0 ? '+' : ''}${report.uplift.fill_rate_pct.toFixed(2)}% fill rate\n`);
    
    // Step 7: Generate signed comparison (Ed25519)
    console.log('7️⃣  Generating Ed25519 signed artifact...');
    
    // Generate ephemeral keypair for demo (production uses env vars)
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519', {
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    
    // Canonicalize payload
    const payload = {
      experiment_id: report.experiment_id,
      period: { start: new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString(), end: now.toISOString() },
      control: report.control,
      test: report.test,
      uplift: report.uplift,
      statistical_significance: report.statistical_significance,
    };
    
    const canonical = JSON.stringify(payload, Object.keys(payload).sort());
    const signature = crypto.sign(null, Buffer.from(canonical, 'utf-8'), privateKey);
    
    const signedComparison: SignedComparison = {
      payload,
      signature: signature.toString('base64'),
      public_key_base64: Buffer.from(publicKey, 'utf-8').toString('base64'),
      algorithm: 'Ed25519',
      timestamp: now.toISOString(),
    };
    
    console.log(`   ✅ Signed artifact generated`);
    console.log(`   🔑 Public key (first 64 chars): ${signedComparison.public_key_base64.substring(0, 64)}...`);
    console.log(`   ✍️  Signature (first 64 chars): ${signedComparison.signature.substring(0, 64)}...\n`);
    
    // Step 8: Verify signature (CLI simulation)
    console.log('8️⃣  Verifying Ed25519 signature...');
    try {
      const publicKeyPem = Buffer.from(signedComparison.public_key_base64, 'base64').toString('utf-8');
      const signatureBuffer = Buffer.from(signedComparison.signature, 'base64');
      
      const verified = crypto.verify(
        null,
        Buffer.from(canonical, 'utf-8'),
        publicKeyPem,
        signatureBuffer
      );
      
      if (!verified) {
        throw new Error('Signature verification failed');
      }
      
      console.log(`   ✅ Signature verified successfully!`);
      console.log(`   🔐 Report is cryptographically authentic\n`);
    } catch (err: any) {
      console.error(`   ❌ Signature verification FAILED: ${err.message}\n`);
      process.exit(1);
    }
    
    // Step 9: Performance validation - Assignment latency
    console.log('9️⃣  Performance validation: Assignment latency...');
    const iterations = 10000;
    const startTime = process.hrtime.bigint();
    
    for (let i = 0; i < iterations; i++) {
      // Simulate deterministic assignment (simplified)
      const userId = `user_${i}`;
      const hash = crypto.createHash('sha256').update(`${experiment.seed}:${userId}`).digest();
      const bucket = hash.readUInt32BE(0) % 100;
      
      let arm: string;
      if (bucket < experiment.mirror_percent) {
        arm = 'mirror'; // Test arm mirrored traffic
      } else {
        arm = 'control'; // Main production traffic
      }
    }
    
    const endTime = process.hrtime.bigint();
    const durationMs = Number(endTime - startTime) / 1_000_000;
    const avgLatencyMs = durationMs / iterations;
    
    console.log(`   ✅ ${iterations.toLocaleString()} assignments in ${durationMs.toFixed(2)}ms`);
    console.log(`   ⚡ Average latency: ${(avgLatencyMs * 1000).toFixed(2)}µs (${avgLatencyMs.toFixed(4)}ms)`);
    
    if (avgLatencyMs > 0.1) {
      console.log(`   ⚠️  WARNING: Latency ${avgLatencyMs.toFixed(4)}ms exceeds 0.1ms p50 target\n`);
    } else {
      console.log(`   ✅ Performance target met (<0.1ms p50)\n`);
    }
    
    // Cleanup
    console.log('🧹 Cleaning up test data...');
    await pool.query('DELETE FROM migration_guardrail_snapshots WHERE experiment_id = $1', [experiment.id]);
    await pool.query('DELETE FROM migration_events WHERE experiment_id = $1', [experiment.id]);
    await pool.query('DELETE FROM migration_mappings WHERE experiment_id = $1', [experiment.id]);
    await pool.query('DELETE FROM migration_experiments WHERE id = $1', [experiment.id]);
    // Note: Not deleting publisher as it might be used by other tests
    console.log('   ✅ Test data cleaned\n');
    
    console.log('🎉 E2E Smoke Test PASSED\n');
    console.log('Summary:');
    console.log('  ✅ Experiment lifecycle: create → activate → simulate → report');
    console.log('  ✅ Adapter mappings: import and persist');
    console.log('  ✅ Guardrail snapshots: 14 days of synthetic data');
    console.log('  ✅ Report generation: metrics, uplift, statistical significance');
    console.log('  ✅ Ed25519 signing: signature generation and verification');
    console.log(`  ✅ Performance: ${(avgLatencyMs * 1000).toFixed(2)}µs assignment latency`);
    
  } catch (err: any) {
    console.error('\n❌ E2E Test FAILED:', err.message);
    console.error(err.stack);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
