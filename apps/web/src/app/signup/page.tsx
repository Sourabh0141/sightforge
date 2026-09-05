"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  Card,
  ErrorBanner,
  TurnstileWidget,
  SparklesIcon,
} from "@sightforge/ui";
import { authClient } from "@/lib/auth";
import { ApiError } from "@/lib/api-client";
import { getErrorDescriptor } from "@/lib/errors";

export default function SignUpPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState("");
  const [isDeriving, setIsDeriving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMessage(null);

    const form = e.currentTarget;
    const passwordInput = form.elements.namedItem(
      "password",
    ) as HTMLInputElement;
    const confirmInput = form.elements.namedItem(
      "confirmPassword",
    ) as HTMLInputElement;

    const password = passwordInput?.value || "";
    const confirmPassword = confirmInput?.value || "";

    if (!email || !password) {
      setErrorMessage("Please enter both your email address and password.");
      return;
    }

    if (password.length < 10 || password.length > 128) {
      setErrorMessage("Password must be between 10 and 128 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage("Passwords do not match. Please verify and try again.");
      return;
    }

    setIsDeriving(true);

    try {
      // Execute zero-knowledge registration flow
      await authClient.register({
        email,
        password,
        turnstileToken: turnstileToken || undefined,
      });

      // Redirect on success
      router.push("/jobs");
    } catch (err) {
      if (err instanceof ApiError) {
        const desc = getErrorDescriptor(err.code);
        setErrorMessage(desc.message || err.message);
      } else {
        setErrorMessage(
          err instanceof Error
            ? err.message
            : "An unexpected error occurred during registration.",
        );
      }
    } finally {
      setIsDeriving(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0C10] text-[#E8EAED] flex flex-col lg:flex-row antialiased">
      {/* Left Column: Form Area */}
      <div className="flex-1 flex flex-col justify-center items-center px-6 py-12 lg:w-1/2 min-h-screen">
        <div className="w-full max-w-[420px] space-y-6">
          {/* Logo & Header */}
          <div className="space-y-2">
            <a
              href="/"
              className="inline-flex items-center gap-2 text-[#22D3EE] hover:opacity-80 transition-opacity"
            >
              <SparklesIcon size={20} />
              <span className="font-semibold text-lg tracking-tight text-[#E8EAED]">
                SightForge
              </span>
            </a>
            <h1 className="text-2xl font-bold tracking-tight text-[#E8EAED] pt-2">
              Create your account
            </h1>
            <p className="text-sm text-[#9AA3B2]">
              Already have an account?{" "}
              <a
                href="/signin"
                className="text-[#22D3EE] hover:underline underline-offset-4"
              >
                Sign in
              </a>
            </p>
          </div>

          {/* Error Banner */}
          {errorMessage && (
            <ErrorBanner
              title="Registration failed"
              message={errorMessage}
              variant="error"
            />
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label
                htmlFor="email"
                className="block text-xs font-mono uppercase tracking-wider text-[#9AA3B2]"
              >
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="developer@organization.com"
                className="w-full bg-[#12151C] border border-[#252B37] rounded-[8px] px-3.5 py-2.5 text-sm text-[#E8EAED] placeholder-[#6B7280] focus:outline-none focus:border-[#22D3EE] focus:ring-2 focus:ring-[#22D3EE]/20 transition-all font-mono"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="password"
                  className="block text-xs font-mono uppercase tracking-wider text-[#9AA3B2]"
                >
                  Password
                </label>
                <span className="text-[11px] font-mono text-[#6B7280]">
                  Min. 10 characters
                </span>
              </div>
              <div className="relative">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  required
                  autoComplete="new-password"
                  placeholder="••••••••••••"
                  className="w-full bg-[#12151C] border border-[#252B37] rounded-[8px] pl-3.5 pr-12 py-2.5 text-sm text-[#E8EAED] placeholder-[#6B7280] focus:outline-none focus:border-[#22D3EE] focus:ring-2 focus:ring-[#22D3EE]/20 transition-all font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 px-3 flex items-center text-xs font-mono text-[#9AA3B2] hover:text-[#E8EAED] transition-colors"
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="confirmPassword"
                className="block text-xs font-mono uppercase tracking-wider text-[#9AA3B2]"
              >
                Confirm Password
              </label>
              <input
                id="confirmPassword"
                name="confirmPassword"
                type={showPassword ? "text" : "password"}
                required
                autoComplete="new-password"
                placeholder="••••••••••••"
                className="w-full bg-[#12151C] border border-[#252B37] rounded-[8px] px-3.5 py-2.5 text-sm text-[#E8EAED] placeholder-[#6B7280] focus:outline-none focus:border-[#22D3EE] focus:ring-2 focus:ring-[#22D3EE]/20 transition-all font-mono"
              />
            </div>

            {/* Turnstile Bot Protection */}
            <div className="pt-2">
              <TurnstileWidget
                onSuccess={(token) => setTurnstileToken(token)}
                onExpire={() => setTurnstileToken("")}
              />
            </div>

            {/* Submit & Derivation Progress */}
            <div className="pt-2 space-y-3">
              <Button
                type="submit"
                variant="primary"
                isLoading={isDeriving}
                className="w-full justify-center py-2.5"
              >
                {isDeriving
                  ? "Securing password in browser..."
                  : "Create account"}
              </Button>

              {isDeriving && (
                <div className="p-3 rounded-[6px] bg-[#1A1F29] border border-[#252B37] space-y-2 text-center">
                  <div className="h-1 w-full bg-[#252B37] rounded-full overflow-hidden relative">
                    <div className="absolute inset-0 bg-[#22D3EE] animate-pulse" />
                  </div>
                  <p className="text-[11px] font-mono text-[#9AA3B2]">
                    Deriving cryptographic key in browser with Argon2id.
                    Plaintext password is never sent to the network.
                  </p>
                </div>
              )}
            </div>
          </form>
        </div>
      </div>

      {/* Right Column: Technical Details */}
      <div className="hidden lg:flex flex-1 bg-[#12151C] border-l border-[#252B37] p-12 flex-col justify-between">
        <div className="max-w-md space-y-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#1A1F29] border border-[#252B37] text-xs font-mono text-[#22D3EE]">
            <span>Zero-Knowledge Authentication</span>
          </div>
          <h2 className="text-3xl font-bold tracking-tight text-[#E8EAED] leading-tight">
            Enterprise computer vision built on open standards.
          </h2>
          <p className="text-sm text-[#9AA3B2] leading-relaxed">
            Run instance segmentation, 16-bit depth estimation, pose tracking,
            and oriented bounding boxes over real-time serverless GPU
            infrastructure.
          </p>

          <div className="pt-6 border-t border-[#252B37] grid grid-cols-2 gap-4">
            <Card className="space-y-1">
              <div className="text-xs font-mono text-[#9AA3B2]">
                Client Hash
              </div>
              <div className="text-sm font-semibold text-[#22D3EE] font-mono">
                Argon2id 19.4 MB
              </div>
            </Card>
            <Card className="space-y-1">
              <div className="text-xs font-mono text-[#9AA3B2]">
                Server Security
              </div>
              <div className="text-sm font-semibold text-[#22D3EE] font-mono">
                Salt + Pepper HMAC
              </div>
            </Card>
          </div>
        </div>

        <div className="text-xs font-mono text-[#6B7280]">
          SightForge v1.0.0 · AGPL-3.0 Open Source
        </div>
      </div>
    </div>
  );
}
