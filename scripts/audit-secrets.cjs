const { execSync } = require('node:child_process');

try {
  // Check staged diff first, otherwise fallback to last commit diff if in CI, or whole git diff
  let diff = '';
  try {
    diff = execSync('git diff --cached', { encoding: 'utf-8' });
  } catch {}

  if (!diff || diff.trim().length === 0) {
    try {
      diff = execSync('git diff HEAD~1 HEAD', { encoding: 'utf-8' });
    } catch {}
  }

  if (!diff || diff.trim().length === 0) {
    process.exit(0);
  }

  const patterns = [
    /BEGIN (?:RSA|OPENSSH|EC|DSA|PRIVATE)? KEY/,
    /\bak-[a-zA-Z0-9]{16,}\b/,
    /\bas-[a-zA-Z0-9]{16,}\b/,
    /CLOUDFLARE_API_TOKEN\s*=\s*['"][a-zA-Z0-9_-]{20,}['"]/,
    /CF_API_KEY\s*=\s*['"][a-zA-Z0-9_-]{20,}['"]/,
    /ghp_[a-zA-Z0-9]{36}/,
    /gho_[a-zA-Z0-9]{36}/,
    /xox[baprs]-[a-zA-Z0-9]{10,}/,
  ];

  for (const pattern of patterns) {
    if (pattern.test(diff)) {
      console.error(`\n❌ SECURITY VIOLATION: Potential credential or secret matched diff: ${pattern}`);
      console.error('Operation aborted. Remove the credential before proceeding.\n');
      process.exit(1);
    }
  }
} catch (err) {
  if (err.status) {
    process.exit(err.status);
  }
}
process.exit(0);
