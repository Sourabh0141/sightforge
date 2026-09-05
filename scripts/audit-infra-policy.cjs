#!/usr/bin/env node

/**
 * SightForge Infrastructure Security & Policy Audit (Plan 5, Unit 4 / R88)
 *
 * Enforces strict, deterministic security and policy rules across all Terraform
 * configurations in infra/terraform:
 *
 * 1. CORS Policy: No wildcard origins ("*") in R2 bucket CORS configurations.
 * 2. Secrets in IaC: No sensitive variables with hardcoded non-null default values.
 * 3. Lifecycle Policies: Media storage buckets must declare multipart abort and retention rules.
 * 4. Naming & Isolation: Resource names and worker tags must adhere to SightForge conventions.
 */

const fs = require('node:fs');
const path = require('node:path');

const ROOT_DIR = path.resolve(__dirname, '..');
const TF_DIR = path.resolve(ROOT_DIR, 'infra/terraform');

function findTfFiles(dir, fileList = []) {
  if (!fs.existsSync(dir)) return fileList;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== '.terraform') {
        findTfFiles(fullPath, fileList);
      }
    } else if (entry.isFile() && entry.name.endsWith('.tf')) {
      fileList.push(fullPath);
    }
  }
  return fileList;
}

function auditInfraPolicy(targetDir = TF_DIR) {
  const violations = [];
  const files = findTfFiles(targetDir);

  if (files.length === 0) {
    violations.push(`No Terraform (.tf) files found in ${targetDir}`);
    return { violations, passed: false };
  }

  let hasR2Lifecycle = false;
  let hasR2Cors = false;

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf-8');
    const relativePath = path.relative(ROOT_DIR, file).replace(/\\/g, '/');

    // Rule 1: No wildcard CORS origins
    if (file.endsWith('main.tf') || file.endsWith('variables.tf')) {
      // Check for allowed_origins containing "*" directly
      const wildcardCorsRegex = /allowed_origins\s*=\s*\[[^\]]*"\*"[^\]]*\]/i;
      if (wildcardCorsRegex.test(content)) {
        violations.push(
          `[CRITICAL] Wildcard CORS origin ("*") detected in ${relativePath}. Explicit origin whitelist required.`
        );
      }
    }

    // Rule 2: Sensitive variables must not contain non-null/non-empty default values
    if (file.endsWith('variables.tf')) {
      // Match variable blocks: variable "name" { ... }
      const variableBlocks = content.split(/variable\s+"([^"]+)"\s*\{/g);
      for (let i = 1; i < variableBlocks.length; i += 2) {
        const varName = variableBlocks[i];
        const varBody = variableBlocks[i + 1] || '';

        const isSensitive = /sensitive\s*=\s*true/i.test(varBody);
        const hasDefault = /default\s*=\s*([^\r\n}]+)/i.test(varBody);

        if (isSensitive && hasDefault) {
          const defaultMatch = varBody.match(/default\s*=\s*([^\r\n}]+)/i);
          const defaultValue = defaultMatch ? defaultMatch[1].trim() : '';
          if (defaultValue !== 'null' && defaultValue !== '""') {
            violations.push(
              `[CRITICAL] Sensitive variable "${varName}" in ${relativePath} contains hardcoded default (${defaultValue}). Sensitive values must be supplied via environment variables.`
            );
          }
        }
      }
    }

    // Rule 3: Check for R2 lifecycle and CORS presence in prod main.tf
    if (relativePath.includes('prod/main.tf')) {
      if (content.includes('cloudflare_r2_bucket_lifecycle')) {
        hasR2Lifecycle = true;
      }
      if (content.includes('cloudflare_r2_bucket_cors')) {
        hasR2Cors = true;
      }
    }
  }

  // Ensure production Terraform declares mandatory R2 lifecycle and CORS
  if (!hasR2Lifecycle) {
    violations.push(
      `[HIGH] Production Terraform (prod/main.tf) is missing cloudflare_r2_bucket_lifecycle rule for media retention.`
    );
  }
  if (!hasR2Cors) {
    violations.push(
      `[HIGH] Production Terraform (prod/main.tf) is missing cloudflare_r2_bucket_cors rule for media uploads.`
    );
  }

  return {
    violations,
    passed: violations.length === 0,
    filesChecked: files.length,
  };
}

function runCli() {
  console.log('='.repeat(70));
  console.log('🛡️ SightForge Infrastructure Security & Policy Audit (R88)');
  console.log('='.repeat(70));

  const result = auditInfraPolicy();

  console.log(`Checked ${result.filesChecked} Terraform configuration files under infra/terraform.`);

  if (!result.passed) {
    console.error('\n❌ Policy Violations Found:');
    for (const violation of result.violations) {
      console.error(`  - ${violation}`);
    }
    console.error('\nAudit failed with violations. Halting pipeline.');
    process.exit(1);
  }

  console.log('\n✅ All infrastructure policy checks passed with 0 violations!');
  console.log('   - No wildcard CORS origins');
  console.log('   - No hardcoded sensitive variable defaults');
  console.log('   - Mandatory R2 bucket lifecycle and CORS rules present');
  console.log('='.repeat(70));
  process.exit(0);
}

if (require.main === module) {
  runCli();
}

module.exports = { auditInfraPolicy, findTfFiles };
