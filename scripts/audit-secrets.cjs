const { execSync } = require('node:child_process');

try {
  const diff = execSync('git diff --cached', { encoding: 'utf-8' });
  if (!diff) {
    process.exit(0);
  }

  const patterns = [
    /BEGIN (?:RSA|OPENSSH|EC|DSA|PRIVATE)? KEY/,
    /ak-[a-zA-Z0-9]{16,}/,
    /as-[a-zA-Z0-9]{16,}/,
    /CLOUDFLARE_API_TOKEN\s*=\s*['"][a-zA-Z0-9_-]{20,}['"]/,
  ];

  for (const pattern of patterns) {
    if (pattern.test(diff)) {
      console.error(`\n❌ SECURITY VIOLATION: Potential credential or secret matched staged diff: ${pattern}`);
      console.error('Commit aborted. Remove secret before committing.\n');
      process.exit(1);
    }
  }
} catch (err) {
  if (err.status) {
    process.exit(err.status);
  }
  // Not inside a git repo or other non-fatal error
}
process.exit(0);
