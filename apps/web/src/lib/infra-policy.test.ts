import { describe, it, expect } from "vitest";
import path from "node:path";
import fs from "node:fs";
import {
  auditInfraPolicy,
  findTfFiles,
} from "../../../../scripts/audit-infra-policy.cjs";

describe("Infrastructure Security & Policy Audit (R88)", () => {
  it("passes cleanly on current repo Terraform configurations", () => {
    const result = auditInfraPolicy();
    expect(result.passed).toBe(true);
    expect(result.violations).toHaveLength(0);
    expect(result.filesChecked).toBeGreaterThanOrEqual(5);
  });

  it("finds all .tf files recursively in infra/terraform", () => {
    const tfDir = path.resolve(process.cwd(), "../../infra/terraform");
    const files = findTfFiles(tfDir);
    expect(files.length).toBeGreaterThanOrEqual(5);
    for (const f of files) {
      expect(f.endsWith(".tf")).toBe(true);
    }
  });

  it("flags wildcard CORS origins in temporary mock directory", () => {
    const mockDir = path.resolve(process.cwd(), "scratch-mock-tf-cors");
    fs.mkdirSync(mockDir, { recursive: true });
    fs.writeFileSync(
      path.join(mockDir, "main.tf"),
      `
resource "cloudflare_r2_bucket_cors" "bad_cors" {
  rules = [
    {
      allowed_origins = ["*"]
      allowed_methods = ["GET"]
    }
  ]
}
resource "cloudflare_r2_bucket_lifecycle" "life" {}
`,
      "utf-8",
    );

    try {
      const result = auditInfraPolicy(mockDir);
      expect(result.passed).toBe(false);
      expect(
        result.violations.some((v: string) =>
          v.includes("Wildcard CORS origin"),
        ),
      ).toBe(true);
    } finally {
      fs.rmSync(mockDir, { recursive: true, force: true });
    }
  });

  it("flags sensitive variable with hardcoded default in temporary mock directory", () => {
    const mockDir = path.resolve(process.cwd(), "scratch-mock-tf-secret");
    fs.mkdirSync(mockDir, { recursive: true });
    fs.writeFileSync(
      path.join(mockDir, "variables.tf"),
      `
variable "api_secret" {
  type      = string
  sensitive = true
  default   = "super-secret-token-123"
}
`,
      "utf-8",
    );

    try {
      const result = auditInfraPolicy(mockDir);
      expect(result.passed).toBe(false);
      expect(
        result.violations.some((v: string) =>
          v.includes('Sensitive variable "api_secret"'),
        ),
      ).toBe(true);
    } finally {
      fs.rmSync(mockDir, { recursive: true, force: true });
    }
  });

  it("validates static asset _headers Content-Security-Policy compliance (R110)", () => {
    const headersPath = path.resolve(process.cwd(), "public/_headers");
    expect(fs.existsSync(headersPath)).toBe(true);
    const content = fs.readFileSync(headersPath, "utf-8");

    // Ensure CSP is present
    expect(content).toContain("Content-Security-Policy:");
    // Ensure Next.js inline RSC hydration scripts are allowed
    expect(content).toContain(
      "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'",
    );
    // Ensure WebAssembly worker derivation is permitted
    expect(content).toContain("worker-src 'self' blob:");
    // Ensure Cloudflare workers.dev domains are allowed for API & WebSocket streaming
    expect(content).toContain("https://*.workers.dev");
    expect(content).toContain("wss://*.workers.dev");
    // Ensure Cloudflare R2 storage domain is allowed for direct browser binary uploads
    expect(content).toContain("https://*.r2.cloudflarestorage.com");
  });
});
