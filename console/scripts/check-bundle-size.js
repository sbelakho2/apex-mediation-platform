#!/usr/bin/env node

/**
 * Bundle size checker for Next.js builds
 * Checks .next/static bundles against size budgets
 * Fails CI if budgets are exceeded
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

// Size budgets in KB
const CHUNK_SIZE_BUDGETS = {
  'chunks/main': 300,       // Main chunk
  'chunks/framework': 200,  // React/Next framework
  'chunks/commons': 150,    // Common dependencies
};

const APP_ROUTE_BUDGETS = {
  'app/page': 160,                   // Landing page
  'app/dashboard/page': 320,         // Dashboard shell
  'app/login/page': 120,             // Auth/login
  'app/billing/page': 280,           // Billing overview
  'app/transparency/auctions/page': 300, // Transparency data table
};

// Warning threshold (90% of budget)
const WARNING_THRESHOLD = 0.9;

function getDirectorySize(dirPath) {
  let totalSize = 0;

  if (!fs.existsSync(dirPath)) {
    return 0;
  }

  const files = fs.readdirSync(dirPath, { withFileTypes: true });

  for (const file of files) {
    const filePath = path.join(dirPath, file.name);

    if (file.isDirectory()) {
      totalSize += getDirectorySize(filePath);
    } else {
      totalSize += fs.statSync(filePath).size;
    }
  }

  return totalSize;
}

function formatSize(bytes) {
  return (bytes / 1024).toFixed(2) + ' KB';
}

function checkBundleSizes() {
  const nextDir = path.join(process.cwd(), '.next');
  const staticDir = path.join(nextDir, 'static');

  if (!fs.existsSync(staticDir)) {
    console.warn('⚙️  No build artifacts detected. Running `npm run build` before checking bundle sizes...');
    const buildResult = spawnSync('npm', ['run', 'build'], { stdio: 'inherit' });
    if (buildResult.status !== 0) {
      console.error('❌ Unable to generate build artifacts required for bundle size reporting.');
      process.exit(buildResult.status || 1);
    }
    if (!fs.existsSync(staticDir)) {
      console.error('❌ .next/static directory still missing after build. Aborting bundle size check.');
      process.exit(1);
    }
  }

  console.log('📦 Checking bundle sizes...\n');

  const results = [];
  let totalSize = 0;
  let hasError = false;
  let hasWarning = false;

  // Check JS bundles
  const chunksDir = path.join(staticDir, 'chunks');
  if (fs.existsSync(chunksDir)) {
    const chunkFiles = fs.readdirSync(chunksDir).filter(f => f.endsWith('.js'));
    
    for (const file of chunkFiles) {
      const filePath = path.join(chunksDir, file);
      const size = fs.statSync(filePath).size;
      totalSize += size;

      // Map to budget category
      let category = null;
      if (file.includes('framework')) category = 'chunks/framework';
      else if (file.includes('commons')) category = 'chunks/commons';
      else if (file.startsWith('main') || file.includes('main-app')) category = 'chunks/main';

      if (!category) {
        continue;
      }

      const budget = CHUNK_SIZE_BUDGETS[category];
      if (budget) {
        const sizeKB = size / 1024;
        const percentOfBudget = (sizeKB / budget) * 100;

        let status = '✅';
        if (sizeKB > budget) {
          status = '❌';
          hasError = true;
        } else if (sizeKB > budget * WARNING_THRESHOLD) {
          status = '⚠️';
          hasWarning = true;
        }

        results.push({
          name: file,
          size: sizeKB,
          budget,
          status,
          percentOfBudget,
        });
      }
    }
  }

  // Check App Router server bundles
  const appServerDir = path.join(nextDir, 'server', 'app');
  if (fs.existsSync(appServerDir)) {
    const walkAppRoutes = (dir, prefix = []) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const nextPrefix = [...prefix, entry.name];

        if (entry.isDirectory()) {
          walkAppRoutes(fullPath, nextPrefix);
          continue;
        }

        if (!entry.name.endsWith('.js') && !entry.name.endsWith('.mjs')) {
          continue;
        }

        if (entry.name !== 'page.js' && entry.name !== 'page.mjs') {
          continue;
        }

        const size = fs.statSync(fullPath).size;
        totalSize += size;

  const routeSegments = nextPrefix.slice(0, -1);
  const routePath = routeSegments.length ? routeSegments.join('/') : '';
  const routeKey = routePath ? `app/${routePath}/page` : 'app/page';
        const budget = APP_ROUTE_BUDGETS[routeKey];

        if (!budget) continue;

        const sizeKB = size / 1024;
        const percentOfBudget = (sizeKB / budget) * 100;

        let status = '✅';
        if (sizeKB > budget) {
          status = '❌';
          hasError = true;
        } else if (sizeKB > budget * WARNING_THRESHOLD) {
          status = '⚠️';
          hasWarning = true;
        }

        results.push({
          name: routeKey,
          size: sizeKB,
          budget,
          status,
          percentOfBudget,
        });
      }
    };

    walkAppRoutes(appServerDir);
  }

  // Print results
  console.log('Bundle                    Size      Budget    Status');
  console.log('─'.repeat(60));

  for (const result of results) {
    const name = result.name.padEnd(25);
    const size = formatSize(result.size * 1024).padEnd(10);
    const budget = formatSize(result.budget * 1024).padEnd(10);
    const percent = `${result.percentOfBudget.toFixed(0)}%`.padStart(5);

    console.log(`${result.status} ${name} ${size} ${budget} ${percent}`);
  }

  console.log('─'.repeat(60));
  console.log(`Total bundle size: ${formatSize(totalSize)}\n`);

  // Generate JSON report
  const report = {
    timestamp: new Date().toISOString(),
    totalSize: totalSize,
    totalSizeKB: totalSize / 1024,
    bundles: results,
    passed: !hasError,
    warnings: hasWarning,
  };

  fs.writeFileSync(
    path.join(process.cwd(), 'bundle-size-report.json'),
    JSON.stringify(report, null, 2)
  );

  console.log('📄 Report saved to bundle-size-report.json\n');

  // Exit with appropriate code
  if (hasError) {
    console.error('❌ Bundle size check FAILED: Some bundles exceed their budgets.');
    process.exit(1);
  } else if (hasWarning) {
    console.warn('⚠️  Bundle size check PASSED with warnings: Some bundles are close to their budgets.');
    process.exit(0);
  } else {
    console.log('✅ Bundle size check PASSED: All bundles within budgets.');
    process.exit(0);
  }
}

// Run check
checkBundleSizes();
