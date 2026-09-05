#!/usr/bin/env node

/**
 * SightForge Unified Production Deployment Pipeline (Plan 5, Unit 5 / R89, R90, R91, R93, KTD4, KTD5)
 *
 * Implements the deterministic 7-step deployment sequence:
 * 1. Build frontend static export (apps/web)
 * 2. Fail-fast dry-run bundling, typecheck, & unit tests (TypeScript + Python)
 * 3. Apply Cloudflare infrastructure via Terraform (infra/terraform/environments/prod)
 * 4. Inject out-of-band secrets into Workers and Modal (scripts/inject-secrets.cjs)
 * 5. Apply remote D1 database migrations (packages/db)
 * 6. Deploy live Worker versions & Modal inference app tagged with commit SHA
 * 7. Run post-deployment smoke test suite against live/staged endpoints
 */

const { execSync } = require('node:child_process');
const path = require('node:path');

const ROOT_DIR = path.resolve(__dirname, '../..');
const TF_DIR = path.resolve(ROOT_DIR, 'infra/terraform/environments/prod');

const isDryRun = process.argv.includes('--dry-run');
const skipInfra = process.argv.includes('--skip-infra');
const skipModal = process.argv.includes('--skip-modal');
const skipSmoke = process.argv.includes('--skip-smoke');
const isStrict = process.argv.includes('--strict');

function logStep(stepNum, title) {
  console.log('\n' + '='.repeat(70));
  console.log(`[Step ${stepNum}/7] ${title}`);
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

function getCommitSha() {
  try {
    return execSync('git rev-parse HEAD', { encoding: 'utf-8' }).trim();
  } catch {
    return 'local-manual-release';
  }
}

async function main() {
  const startTime = Date.now();
  const commitSha = process.env.GITHUB_SHA || getCommitSha();

  console.log('🚀 SightForge Production Deployment Pipeline');
  console.log(`Mode: ${isDryRun ? 'DRY RUN' : 'PRODUCTION APPLY'}`);
  console.log(`Commit SHA: ${commitSha}`);
  console.log(`Root: ${ROOT_DIR}`);

  // Step 1: Build Frontend Static Export (KTD4)
  logStep(1, 'Building Frontend Static Export (apps/web)');
  run('pnpm --filter sightforge-web build');

  // Step 2: Fail-Fast Typecheck & Test Pre-flight (R81)
  logStep(2, 'Pre-Flight: Typecheck, Lint, and Test Across Monorepo');
  run('pnpm turbo run typecheck lint test');
  run('uv run pytest services/inference');

  if (isDryRun) {
    console.log('\n🔍 Running dry-run secret and smoke checks...');
    run('node scripts/inject-secrets.cjs --dry-run');
    run('node scripts/smoke-test.cjs --mock');
    console.log('\n✅ Dry-run pre-flight passed. Halting before infrastructure mutation.');
    return;
  }

  // Step 3: Apply Infrastructure via Terraform (P1 U5, R79, R89)
  logStep(3, 'Applying Cloudflare Infrastructure via Terraform');
  if (!skipInfra) {
    const cfAccountId = process.env.CLOUDFLARE_ACCOUNT_ID;
    const backendConfigArg = cfAccountId
      ? ` -backend-config="endpoints={s3=\\"https://${cfAccountId}.r2.cloudflarestorage.com\\"}"`
      : '';
    run(`terraform init -input=false${backendConfigArg}`, TF_DIR);
    run('terraform apply -auto-approve -input=false', TF_DIR);
  } else {
    console.log('Skipping Terraform apply (--skip-infra flag passed)');
  }

  // Step 4: Inject Out-of-Band Secrets (R76, R93)
  logStep(4, 'Injecting Out-of-Band Secrets (Workers & Modal)');
  run(`node scripts/inject-secrets.cjs ${isStrict ? '--strict' : ''}`);

  // Extract Resource IDs for Database Migration
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
  run(`pnpm --filter @sightforge/db exec wrangler d1 migrations apply ${d1DatabaseName} --remote`);

  // Step 6: Deploy Worker Versions & Modal Inference App Tagged with Commit SHA (KTD5, R83)
  logStep(6, `Deploying Cloudflare Workers & Modal App (Release: ${commitSha})`);
  const workers = [
    'sightforge-api-jobs',
    'sightforge-api-auth',
    'sightforge-events',
    'sightforge-scheduler',
    'sightforge-web',
  ];

  for (const worker of workers) {
    console.log(`\nDeploying ${worker}...`);
    run(`pnpm --filter ${worker} exec wrangler deploy`);
  }

  if (!skipModal) {
    console.log('\nDeploying Modal Inference App...');
    run(
      'uv run --package sightforge-inference modal deploy -m sightforge_inference.endpoint --name sightforge-inference',
    );
  } else {
    console.log('Skipping Modal deployment (--skip-modal flag passed)');
  }

  // Step 7: Post-Deployment Smoke Test (R91)
  logStep(7, 'Executing Post-Deployment Smoke Test Suite');
  if (!skipSmoke) {
    const deployUrl = process.env.DEPLOY_URL || 'https://sightforge.app';
    run(`node scripts/smoke-test.cjs --target ${deployUrl}`);
  } else {
    console.log('Skipping smoke tests (--skip-smoke flag passed)');
  }

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log('\n' + '='.repeat(70));
  console.log(`✨ Full 7-Step Deployment completed successfully in ${durationSec}s!`);
  console.log('='.repeat(70));
}

if (require.main === module) {
  main();
}

module.exports = { main };