"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";

interface SettingsResp {
  settings: {
    provider: string;
    api_key: string | null;
  };
}

async function fetchSettings(): Promise<SettingsResp> {
  const r = await fetch("/api/settings");
  if (!r.ok) throw new Error("failed");
  return r.json();
}

// Slim top banner shown across the app when the user hasn't set up a
// Groq/OpenAI key yet. Hides itself automatically on /settings and
// /login, and when Ollama is the selected provider (no key needed).
export function LLMSetupBanner() {
  const pathname = usePathname();
  const { data } = useQuery({
    queryKey: ["settings"],
    queryFn: fetchSettings,
    staleTime: 30_000,
  });

  if (!data) return null;
  if (pathname === "/settings" || pathname === "/login") return null;
  if (data.settings.provider === "ollama") return null;
  if (data.settings.api_key) return null;

  return (
    <div className="shrink-0 border-b border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_10%,var(--bg-elev))] px-4 py-2 flex items-center gap-3 text-xs">
      <span className="font-mono uppercase tracking-wider text-[var(--accent)] shrink-0">
        Setup
      </span>
      <span className="text-[var(--fg)] flex-1 min-w-0">
        Add your own LLM API key to build and reroll sets — free Groq
        tier, ~30 seconds.
      </span>
      <Link
        href="/settings"
        className="shrink-0 font-mono text-[11px] uppercase tracking-wider bg-[var(--accent)] text-black px-3 py-1 rounded-sm font-semibold hover:brightness-110 transition"
      >
        Set up →
      </Link>
    </div>
  );
}
