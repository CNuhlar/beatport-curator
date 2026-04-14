"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Button, Input } from "@/components/ui";

// Outer wrapper: Next.js 16 requires useSearchParams() to live inside a
// Suspense boundary so the prerenderer can CSR-bailout just this subtree
// without killing the whole static build.
export default function LoginPage() {
  return (
    <Suspense fallback={<LoginFallback />}>
      <LoginForm />
    </Suspense>
  );
}

function LoginFallback() {
  return (
    <div className="flex-1 flex items-center justify-center bg-[var(--bg)] text-xs font-mono text-[var(--fg-mute)] animate-pulse">
      loading…
    </div>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/library";
  const qc = useQueryClient();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Login failed");

      // Set cache synchronously so AuthGate sees fresh data on mount.
      // Pure invalidate is async — the redirect would race the refetch
      // and AuthGate would briefly see stale {authenticated:false}.
      qc.setQueryData(["auth-status"], {
        authenticated: true,
        username: d.username,
        email: d.email,
      });
      router.replace(next);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 flex items-center justify-center bg-[var(--bg)] p-10">
      <div className="w-[360px] space-y-6">
        <div className="space-y-1">
          <div className="text-[11px] font-mono tracking-wider text-[var(--fg-mute)] uppercase">
            Beatport Login
          </div>
          <h1 className="text-xl font-semibold text-[var(--fg)]">
            Sign in to Beatport
          </h1>
          <p className="text-xs text-[var(--fg-dim)] leading-relaxed">
            Curator uses your Beatport account to read your playlists, search
            the catalog, and create new sets. Credentials are sent only to
            Beatport's API.
          </p>
        </div>

        <form onSubmit={submit} className="space-y-3">
          <label className="block">
            <span className="text-[11px] font-mono tracking-wider text-[var(--fg-mute)] uppercase block mb-1">
              Username or email
            </span>
            <Input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              autoFocus
              required
            />
          </label>
          <label className="block">
            <span className="text-[11px] font-mono tracking-wider text-[var(--fg-mute)] uppercase block mb-1">
              Password
            </span>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </label>

          {error && (
            <div className="text-xs text-[var(--danger)] font-mono bg-[color-mix(in_srgb,var(--danger)_10%,var(--bg-elev))] border border-[var(--danger)] p-2 rounded-sm break-all">
              {error}
            </div>
          )}

          <Button
            type="submit"
            variant="primary"
            size="lg"
            disabled={loading || !username || !password}
            className="w-full"
          >
            {loading ? "SIGNING IN…" : "SIGN IN"}
          </Button>
        </form>

        <div className="text-[11px] font-mono text-[var(--fg-mute)] leading-relaxed">
          Token is stored as an HttpOnly browser cookie and refreshed
          automatically when it expires.
        </div>
      </div>
    </div>
  );
}
