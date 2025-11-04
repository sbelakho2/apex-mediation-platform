#!/usr/bin/env node

/**
 * Migrate secrets from .env to Infisical
 * 
 * This script reads all secrets from .env file and uploads them to Infisical.
 * Run this once during initial setup.
 * 
 * Prerequisites:
 * 1. Install Infisical CLI: brew install infisical/get-cli/infisical
 * 2. Login to Infisical: infisical login
 * 3. Initialize project: infisical init
 * 
 * Usage:
 *   node scripts/migrate-secrets-to-infisical.js
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function parseEnvFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const secrets = [];
  
  content.split('\n').forEach((line, index) => {
    // Skip comments and empty lines
    if (line.trim().startsWith('#') || line.trim() === '') {
      return;
    }
    
    // Parse KEY=VALUE
    const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (match) {
      const [, key, value] = match;
      secrets.push({ key, value: value.trim() });
    }
  });
  
  return secrets;
}

function checkInfisicalInstalled() {
  try {
    execSync('which infisical', { stdio: 'pipe' });
    return true;
  } catch (error) {
    return false;
  }
}

function checkInfisicalLoggedIn() {
  try {
    execSync('infisical whoami', { stdio: 'pipe' });
    return true;
  } catch (error) {
    return false;
  }
}

function uploadSecret(key, value, environment) {
  try {
    // Escape special characters in value
    const escapedValue = value.replace(/'/g, "'\\''");
    
    const command = `infisical secrets set ${key} '${escapedValue}' --env=${environment}`;
    execSync(command, { stdio: 'pipe' });
    return true;
  } catch (error) {
    log(`  ✗ Failed to upload ${key}: ${error.message}`, 'red');
    return false;
  }
}

async function main() {
  log('\n🔐 Infisical Secret Migration Tool\n', 'cyan');
  
  // Check prerequisites
  log('Checking prerequisites...', 'blue');
  
  if (!checkInfisicalInstalled()) {
    log('✗ Infisical CLI not installed', 'red');
    log('  Run: brew install infisical/get-cli/infisical', 'yellow');
    process.exit(1);
  }
  log('✓ Infisical CLI installed', 'green');
  
  if (!checkInfisicalLoggedIn()) {
    log('✗ Not logged in to Infisical', 'red');
    log('  Run: infisical login', 'yellow');
    process.exit(1);
  }
  log('✓ Logged in to Infisical', 'green');
  
  // Check if .infisical.json exists (project initialized)
  const infisicalConfigPath = path.join(__dirname, '..', '.infisical.json');
  if (!fs.existsSync(infisicalConfigPath)) {
    log('✗ Infisical project not initialized', 'red');
    log('  Run: infisical init', 'yellow');
    process.exit(1);
  }
  log('✓ Infisical project initialized', 'green');
  
  // Read .env file
  const envPath = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) {
    log('✗ .env file not found', 'red');
    process.exit(1);
  }
  
  log('\nParsing .env file...', 'blue');
  const secrets = parseEnvFile(envPath);
  log(`✓ Found ${secrets.length} secrets`, 'green');
  
  // Confirm upload
  log('\nSecrets to upload:', 'blue');
  secrets.forEach(({ key }) => {
    log(`  • ${key}`, 'cyan');
  });
  
  log('\n⚠️  This will upload secrets to the following environments:', 'yellow');
  log('  • development', 'yellow');
  log('  • staging', 'yellow');
  log('  • production', 'yellow');
  
  // Simple confirmation (in a real script, you'd use readline or prompts)
  log('\nPress Ctrl+C to cancel, or continue in 5 seconds...', 'yellow');
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  // Upload to each environment
  const environments = ['development', 'staging', 'production'];
  
  for (const env of environments) {
    log(`\nUploading to ${env}...`, 'blue');
    
    let successCount = 0;
    let failCount = 0;
    
    for (const { key, value } of secrets) {
      const success = uploadSecret(key, value, env);
      if (success) {
        successCount++;
        log(`  ✓ ${key}`, 'green');
      } else {
        failCount++;
      }
    }
    
    log(`\n${env}: ${successCount} succeeded, ${failCount} failed`, 
        failCount > 0 ? 'yellow' : 'green');
  }
  
  log('\n✅ Migration complete!', 'green');
  log('\nNext steps:', 'blue');
  log('  1. Verify secrets in Infisical dashboard: https://app.infisical.com', 'cyan');
  log('  2. Update startup scripts to use: infisical run --env=development -- npm run dev', 'cyan');
  log('  3. Update .gitignore to exclude .env files', 'cyan');
  log('  4. Delete .env file after verification: rm .env', 'cyan');
  log('  5. Commit .infisical.json to git (safe to commit)', 'cyan');
  log('\n');
}

main().catch((error) => {
  log(`\n✗ Migration failed: ${error.message}`, 'red');
  process.exit(1);
});
