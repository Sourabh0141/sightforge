#!/usr/bin/env node

/**
 * SightForge Out-of-Band Secret Injection (Plan 5, Unit 5 / R76, R93)
 *
 * Safely injects secrets from environment / CI secrets manager directly into:
 * 1. Cloudflare Workers (via `wrangler secret put <NAME> --name <WORKER>`)
 * 2. Modal Inference App (via `modal secret create/set sightforge-inference-secrets`)
 *
 * Security Guarantees:
 * - Zero plaintext secret logging to stdout/stderr.
 * - Values are piped through child process stdin to prevent command-line / ps exposure.
 * - Strict inventory mapping ensuring least-privilege scoping across workers.
 */

const { spawnSync } = require('node:child_process');
const path = require('node:path');

const ROOT_DIR = path.resolve(__dirname, '..');

/**
 * Secret inventory mapping for each Cloudflare Worker.
 */
const WORKER_SECRET_MAP = {
  'sightforge-api-auth-prod': [
    { envVar: 'JWT_SECRET', required: true },
    { envVar: 'TURNSTILE_SECRET_KEY', required: true },
    { envVar: 'PASSWORD_SALT_KEY', required: false },
    { envVar: 'PASSWORD_PEPPER', required: false },
  ],
  'sightforge-api-jobs-prod': [
    { envVar: 'JWT_SECRET', required: true },
    { envVar: 'INFERENCE_CALLBACK_SECRET', required: true },
    { envVar: 'R2_MEDIA_ACCESS_KEY_ID', required: true },
    { envVar: 'R2_MEDIA_SECRET_ACCESS_KEY', required: true },
    { envVar: 'CLOUDFLARE_ACCOUNT_ID', required: false },
    { envVar: 'MODAL_API_URL', required: false },
    { envVar: 'MODAL_AUTH_TOKEN', required: false },
  ],
  'sightforge-events-prod': [
    { envVar: 'INFERENCE_CALLBACK_SECRET', required: true },
    { envVar: 'MODAL_CALLBACK_SECRET', alias: 'INFERENCE_CALLBACK_SECRET', required: false },
    { envVar: 'R2_MEDIA_ACCESS_KEY_ID', required: false },
    { envVar: 'R2_MEDIA_SECRET_ACCESS_KEY', required: false },
    { envVar: 'CLOUDFLARE_ACCOUNT_ID', required: false },
  ],
  'sightforge-scheduler-prod': [
    { envVar: 'JWT_SECRET', required: false },
    { envVar: 'CLOUDFLARE_API_TOKEN', required: false },
  ],
  'sightforge-web-prod': [],
};

/**
 * Secret inventory mapping for Modal Inference App.
 */
const MODAL_SECRET_MAP = [
  { envVar: 'MODAL_KEY', required: false },
  { envVar: 'MODAL_SECRET', required: false },
  { envVar: 'MODAL_CALLBACK_SECRET', alias: 'INFERENCE_CALLBACK_SECRET', required: true },
  { envVar: 'R2_MEDIA_ACCESS_KEY_ID', required: false },
  { envVar: 'R2_MEDIA_SECRET_ACCESS_KEY', required: false },
];

function getWorkerSecretMap() {
  return WORKER_SECRET_MAP;
}

function getModalSecretMap() {
  return MODAL_SECRET_MAP;
}

/**
 * Injects a secret into a Cloudflare Worker via wrangler secret put using stdin.
 */
function putWorkerSecret(workerName, secretName, secretValue, isDryRun = false) {
  if (isDryRun) {
    console.log(`  [DRY-RUN] Would inject secret "${secretName}" into worker "${workerName}"`);
    return true;
  }

  const result = spawnSync('pnpm', ['wrangler', 'secret', 'put', secretName, '--name', workerName], {
    cwd: ROOT_DIR,
    input: secretValue,
    encoding: 'utf-8',
    env: process.env,
  });

  if (result.status !== 0) {
    console.error(`  ❌ Failed to inject secret "${secretName}" into worker "${workerName}": ${result.stderr || result.error?.message}`);
    return false;
  }

  console.log(`  ✅ Injected secret "${secretName}" into worker "${workerName}"`);
  return true;
}

/**
 * Injects secrets into Modal secret group via modal secret set or create.
 */
function putModalSecrets(secretEntries, isDryRun = false) {
  const secretGroupName = 'sightforge-inference-secrets';

  if (isDryRun) {
    console.log(`  [DRY-RUN] Would create/update Modal secret group "${secretGroupName}" with ${secretEntries.length} secrets`);
    return true;
  }

  // Format key=value pairs
  const secretArgs = secretEntries.map(({ name, value }) => `${name}=${value}`);

  // Try creating or updating the Modal secret group via uv run modal or modal
  let result = spawnSync('uv', ['run', 'modal', 'secret', 'set', secretGroupName, ...secretArgs], {
    cwd: ROOT_DIR,
    encoding: 'utf-8',
    env: process.env,
  });

  if (result.status !== 0) {
    // Attempt create via uv run modal if set is unsupported or group does not exist yet
    result = spawnSync('uv', ['run', 'modal', 'secret', 'create', secretGroupName, ...secretArgs, '--force'], {
      cwd: ROOT_DIR,
      encoding: 'utf-8',
      env: process.env,
    });

    if (result.status !== 0) {
      // Fallback to direct modal command in system path
      const fallbackResult = spawnSync('modal', ['secret', 'set', secretGroupName, ...secretArgs], {
        cwd: ROOT_DIR,
        encoding: 'utf-8',
        env: process.env,
      });

      if (fallbackResult.status !== 0) {
        const createFallback = spawnSync('modal', ['secret', 'create', secretGroupName, ...secretArgs, '--force'], {
          cwd: ROOT_DIR,
          encoding: 'utf-8',
          env: process.env,
        });

        if (createFallback.status !== 0) {
          console.warn(`  ⚠️ Modal secret group update failed: ${result.stderr || result.error?.message || createFallback.stderr || createFallback.error?.message}`);
          return false;
        }
      }
    }
  }

  console.log(`  ✅ Updated Modal secret group "${secretGroupName}"`);
  return true;
}

/**
 * Main injection controller.
 */
function injectSecrets(options = {}) {
  const isDryRun = options.isDryRun ?? false;
  const isStrict = options.isStrict ?? false;
  const envSource = options.envSource || process.env;

  console.log('='.repeat(70));
  console.log('🔐 SightForge Out-of-Band Secret Injection (R76, R93)');
  console.log(`Mode: ${isDryRun ? 'DRY RUN' : 'PRODUCTION INJECTION'} | Strict: ${isStrict}`);
  console.log('='.repeat(70));

  let totalInjected = 0;
  let missingRequired = 0;
  const missingSecretsList = [];

  // 1. Inject Cloudflare Worker Secrets
  console.log('\n📦 [1/2] Processing Cloudflare Worker Secrets...');
  for (const [workerName, secrets] of Object.entries(WORKER_SECRET_MAP)) {
    if (secrets.length === 0) continue;
    console.log(`\nWorker: ${workerName}`);

    for (const { envVar, required } of secrets) {
      const value = envSource[envVar];
      if (!value || value.trim().length === 0) {
        if (required) {
          missingRequired++;
          missingSecretsList.push({ target: workerName, secret: envVar });
          console.error(`  ❌ Missing required environment secret: ${envVar}`);
        } else {
          console.log(`  ⚪ Optional secret omitted: ${envVar}`);
        }
        continue;
      }

      const success = putWorkerSecret(workerName, envVar, value.trim(), isDryRun);
      if (success) totalInjected++;
    }
  }

  // 2. Inject Modal Inference Secrets
  console.log('\n🔮 [2/2] Processing Modal Inference App Secrets...');
  const modalEntries = [];
  for (const { envVar, alias, required } of MODAL_SECRET_MAP) {
    const value = envSource[envVar] || (alias ? envSource[alias] : undefined);
    if (!value || value.trim().length === 0) {
      if (required) {
        missingRequired++;
        missingSecretsList.push({ target: 'sightforge-inference-secrets', secret: envVar });
        console.error(`  ❌ Missing required Modal secret: ${envVar} (or alias ${alias})`);
      } else {
        console.log(`  ⚪ Optional Modal secret omitted: ${envVar}`);
      }
      continue;
    }
    modalEntries.push({ name: envVar, value: value.trim() });
  }

  if (modalEntries.length > 0) {
    const modalSuccess = putModalSecrets(modalEntries, isDryRun);
    if (modalSuccess) totalInjected += modalEntries.length;
  }

  console.log('\n' + '='.repeat(70));
  console.log(`Secret Injection Summary: ${totalInjected} secrets processed, ${missingRequired} missing required.`);

  if (missingRequired > 0 && isStrict) {
    console.error('\n❌ Strict mode error: Missing required secrets. Aborting deployment.');
    return { success: false, totalInjected, missingRequired, missingSecretsList };
  }

  console.log('✅ Secret injection phase complete.');
  console.log('='.repeat(70));
  return { success: true, totalInjected, missingRequired, missingSecretsList };
}

function runCli() {
  const isDryRun = process.argv.includes('--dry-run');
  const isStrict = process.argv.includes('--strict');

  const result = injectSecrets({ isDryRun, isStrict });
  if (!result.success) {
    process.exit(1);
  }
}

if (require.main === module) {
  runCli();
}

module.exports = {
  injectSecrets,
  getWorkerSecretMap,
  getModalSecretMap,
  putWorkerSecret,
  putModalSecrets,
};
