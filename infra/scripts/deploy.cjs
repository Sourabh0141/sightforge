#!/usr/bin/env node

/**
 * SightForge Unified Deployment Pipeline (Plan 1, Unit 6)
 *
 * Implements the deterministic 6-step deployment sequence:
 * 1. Build frontend static export (apps/web)
 * 2. Fail-fast dry-run bundling & typecheck across all 5 Workers
 * 3. Apply Cloudflare infrastructure via Terraform (infra/terraform/environments/prod)
 * 4. Extract provisioned resource outputs (D1 ID, bucket names)
 * 5. Apply remote D1 database migrations (packages/db)
 * 6. Deploy live Worker versions with bindings (apps/*)
 */

const { execSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

const ROOT_DIR = path.resolve(__dirname, '../..');
const TF_DIR = path.resolve(ROOT_DIR, 'infra/terraform/environments/prod');

const isDryRun = process.argv.includes('--dry-run');
const skipInfra = process.argv.includes('--skip-infra');

function logStep(stepNum, title) {
  console.log('\n' + '='.repeat(70));
  console.log(`[Step ${stepNum}/6] ${title}`);
  console.log('='.repeat(70));
}

function run(command, cwd = ROOT_DIR) {
  console.log(`> (${path.relative(ROOT_DIR, cwd) || '.'}) ${command}`);
  try {
    execSync(command, { cwd, stdio: 'inherit', env: process.env });
  } catch (error) {
    console.error(`\n❌ Step failed with exit code ${error.status || 1}`);
    process.exit(error.status || 1);
  }
}

async function main() {
  const startTime = Date.now();
  console.log('🚀 SightForge Production Deployment Pipeline');
  console.log(`Mode: ${isDryRun ? 'DRY RUN' : 'PRODUCTION APPLY'}`);
  console.log(`Root: ${ROOT_DIR}`);

  // Step 1: Build Frontend Static Export (KTD7)
  logStep(1, 'Building Frontend Static Export (apps/web)');
  run('pnpm --filter sightforge-web build');

  // Step 2: Fail-Fast Typecheck & Worker Bundling Pre-flight (R81)
  logStep(2, 'Pre-Flight: Typecheck & Dry-Run Worker Bundling');
  run('pnpm turbo run typecheck lint test');

  if (isDryRun) {
    console.log('\n✅ Dry-run pre-flight passed. Halting before infrastructure mutation.');
    return;
  }

  // Step 3: Apply Infrastructure via Terraform (P1 U5, R79)
  logStep(3, 'Applying Cloudflare Infrastructure via Terraform');
  if (!skipInfra) {
    run('terraform init -input=false', TF_DIR);
    run('terraform apply -auto-approve -input=false', TF_DIR);
  } else {
    console.log('Skipping Terraform apply (--skip-infra flag passed)');
  }

  // Step 4: Extract Resource IDs
  logStep(4, 'Extracting Provisioned Resource Identifiers');
  let d1DatabaseName = 'sightforge-d1-prod';
  try {
    const tfOutputsRaw = execSync('terraform output -json', { cwd: TF_DIR, env: process.env }).toString();
    const tfOutputs = JSON.parse(tfOutputsRaw);
    if (tfOutputs.d1_database_name && tfOutputs.d1_database_name.value) {
      d1DatabaseName = tfOutputs.d1_database_name.value;
    }
    console.log(`Target D1 Database: ${d1DatabaseName}`);
  } catch {
    console.log(`Using default target database: ${d1DatabaseName}`);
  }

  // Step 5: Remote Database Migrations (P1 U3, R26)
  logStep(5, `Applying Remote D1 Migrations (${d1DatabaseName})`);
  run(`pnpm --filter @sightforge/db wrangler d1 migrations apply ${d1DatabaseName} --remote`);

  // Step 6: Deploy Worker Versions & Bindings (P1 U1, R3, KTD7)
  logStep(6, 'Deploying All 5 Cloudflare Workers (apps/*)');
  const workers = [
    'sightforge-web',
    'sightforge-api-auth',
    'sightforge-api-jobs',
    'sightforge-events',
    'sightforge-scheduler',
  ];

  for (const worker of workers) {
    console.log(`\nDeploying ${worker}...`);
    run(`pnpm --filter ${worker} exec wrangler deploy`);
  }

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log('\n' + '='.repeat(70));
  console.log(`✨ Deployment completed successfully in ${durationSec}s!`);
  console.log('='.repeat(70));
}

main();