"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Card, Input, Select } from "@/components/ui";
import { cn } from "@/lib/utils";

interface LLMSettings {
  provider: string;
  api_key: string | null;
  base_url: string;
  model: string;
}

interface ProviderPreset {
  id: string;
  label: string;
  base_url: string;
  default_model: string;
  signup_url?: string;
  signup_label?: string;
  key_format?: string;
  description: string;
  free?: boolean;
}

interface SettingsResponse {
  settings: LLMSettings;
  presets: ProviderPreset[];
}

interface TestResponse {
  ok: boolean;
  latency_ms?: number;
  reply?: string;
  model?: string;
  error?: string;
}

async function fetchSettings(): Promise<SettingsResponse> {
  const r = await fetch("/api/settings");
  if (!r.ok) throw new Error("Failed to load settings");
  return r.json();
}

async function postSettings(s: Partial<LLMSettings>): Promise<SettingsResponse> {
  const r = await fetch("/api/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(s),
  });
  const d = await r.json();
  if (!r.ok)
    throw new Error(typeof d.error === "string" ? d.error : "Save failed");
  return d;
}

async function testConnection(): Promise<TestResponse> {
  const r = await fetch("/api/settings", { method: "PUT" });
  return r.json();
}

export default function SettingsPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["settings"],
    queryFn: fetchSettings,
  });

  // Local form state, hydrated from server data
  const [provider, setProvider] = useState("groq");
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState("");
  const [showHowto, setShowHowto] = useState(false);
  const [testResult, setTestResult] = useState<TestResponse | null>(null);

  useEffect(() => {
    if (data?.settings) {
      setProvider(data.settings.provider);
      setApiKey(data.settings.api_key ?? "");
      setBaseUrl(data.settings.base_url);
      setModel(data.settings.model);
      // First-run onboarding: if no key is saved yet, open the "how to
      // get a Groq key" instructions by default so the visitor lands
      // right on the steps instead of having to discover them.
      if (!data.settings.api_key) setShowHowto(true);
    }
  }, [data]);

  const presets = data?.presets ?? [];
  const preset = presets.find((p) => p.id === provider);

  const onProviderChange = (id: string) => {
    setProvider(id);
    const p = presets.find((x) => x.id === id);
    if (p) {
      setBaseUrl(p.base_url);
      setModel(p.default_model);
      // keep existing api_key — user might switch back
    }
  };

  const save = useMutation({
    mutationFn: postSettings,
    onSuccess: (d) => {
      qc.setQueryData(["settings"], d);
      setTestResult(null);
    },
  });

  const test = useMutation({
    mutationFn: testConnection,
    onSuccess: (d) => setTestResult(d),
    onError: (e: Error) =>
      setTestResult({ ok: false, error: e.message }),
  });

  const onSave = () => {
    save.mutate({
      provider,
      api_key: apiKey || null,
      base_url: baseUrl,
      model,
    });
  };

  const isOllama = provider === "ollama";
  const noKeyYet = !data?.settings.api_key && data?.settings.provider !== "ollama";

  return (
    <div className="flex-1 overflow-y-auto p-8 bg-[var(--bg)]">
      <div className="max-w-3xl mx-auto space-y-8">
        <div>
          <div className="text-[11px] font-mono tracking-wider text-[var(--fg-mute)] uppercase mb-1">
            Settings
          </div>
          <h1 className="text-2xl font-semibold text-[var(--fg)]">
            LLM Provider
          </h1>
          <p className="text-xs text-[var(--fg-dim)] mt-2 leading-relaxed">
            Curator uses any OpenAI-compatible chat API for the timeline
            builder (Strategy + Compose calls). Pick a provider, paste
            your key, save. The key lives in your browser's HttpOnly
            cookie — nothing is stored server-side.
          </p>
        </div>

        {noKeyYet && (
          <div className="border border-[var(--accent)] rounded-sm p-5 bg-[color-mix(in_srgb,var(--accent)_8%,var(--bg-elev))] space-y-3">
            <div className="flex items-start gap-3">
              <div className="h-8 w-8 rounded-full bg-[var(--accent)] text-black font-bold flex items-center justify-center shrink-0 text-sm">
                1
              </div>
              <div className="flex-1 space-y-2">
                <div className="text-sm font-semibold text-[var(--fg)]">
                  Set up your LLM API key (~30 seconds, free)
                </div>
                <div className="text-xs text-[var(--fg-dim)] leading-relaxed">
                  Curator is BYO-key — you bring your own. Recommended is{" "}
                  <a
                    href="https://console.groq.com/keys"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[var(--accent)] hover:underline font-mono"
                  >
                    Groq
                  </a>{" "}
                  (free tier, 14,400 requests/day, no credit card). Sign
                  in with Google or GitHub, create a key, paste it
                  below, save. The step-by-step guide is at the bottom
                  of this page — already opened for you.
                </div>
              </div>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="text-[var(--fg-mute)] text-xs font-mono">
            Loading…
          </div>
        ) : (
          <>
            {/* Provider picker */}
            <Card className="p-4 space-y-4">
              <div>
                <Label>Provider</Label>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  {presets.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => onProviderChange(p.id)}
                      className={cn(
                        "text-left p-3 rounded-sm border transition-colors cursor-pointer",
                        provider === p.id
                          ? "border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_8%,var(--bg-elev))]"
                          : "border-[var(--border-soft)] bg-[var(--bg-elev)] hover:border-[var(--border)]"
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            "text-xs font-mono tracking-wider uppercase",
                            provider === p.id
                              ? "text-[var(--accent)]"
                              : "text-[var(--fg)]"
                          )}
                        >
                          {p.label}
                        </span>
                        {p.free && (
                          <span className="chip chip-accent-2 font-mono text-[10px]">
                            FREE
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-[var(--fg-mute)] mt-1 leading-relaxed">
                        {p.description}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </Card>

            {/* Credentials */}
            <Card className="p-4 space-y-4">
              <div>
                <Label>
                  API Key{" "}
                  {isOllama && (
                    <span className="text-[var(--fg-mute)] normal-case">
                      (not needed for Ollama)
                    </span>
                  )}
                </Label>
                <Input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={preset?.key_format ?? "API key"}
                  disabled={isOllama}
                  className="font-mono"
                />
                {preset?.signup_url && (
                  <div className="text-[11px] font-mono text-[var(--fg-mute)] mt-1.5">
                    Get one at{" "}
                    <a
                      href={preset.signup_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[var(--accent)] hover:underline"
                    >
                      {preset.signup_label ?? preset.signup_url}
                    </a>
                  </div>
                )}
              </div>

              <div>
                <Label>Base URL</Label>
                <Input
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  className="font-mono"
                />
              </div>

              <div>
                <Label>Model</Label>
                <Input
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  className="font-mono"
                />
                {preset && preset.default_model && (
                  <div className="text-[11px] font-mono text-[var(--fg-mute)] mt-1.5">
                    Default for {preset.label}:{" "}
                    <code className="text-[var(--fg-dim)]">
                      {preset.default_model}
                    </code>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 pt-2">
                <Button
                  variant="primary"
                  size="md"
                  onClick={onSave}
                  disabled={save.isPending}
                >
                  {save.isPending ? "SAVING…" : "SAVE"}
                </Button>
                <Button
                  variant="secondary"
                  size="md"
                  onClick={() => test.mutate()}
                  disabled={test.isPending || (isOllama ? false : !apiKey)}
                >
                  {test.isPending ? "TESTING…" : "TEST CONNECTION"}
                </Button>
                {save.isError && (
                  <span className="text-xs text-[var(--danger)] font-mono">
                    {(save.error as Error).message}
                  </span>
                )}
              </div>

              {testResult && (
                <div
                  className={cn(
                    "text-xs font-mono p-2 rounded-sm border",
                    testResult.ok
                      ? "text-[var(--accent-2)] border-[var(--accent-2)] bg-[color-mix(in_srgb,var(--accent-2)_10%,var(--bg-elev))]"
                      : "text-[var(--danger)] border-[var(--danger)] bg-[color-mix(in_srgb,var(--danger)_10%,var(--bg-elev))]"
                  )}
                >
                  {testResult.ok ? (
                    <>
                      ✓ Connected ·{" "}
                      <span className="text-[var(--fg-dim)]">
                        {testResult.model}
                      </span>{" "}
                      · {testResult.latency_ms}ms · reply: "
                      {testResult.reply}"
                    </>
                  ) : (
                    <>✗ {testResult.error}</>
                  )}
                </div>
              )}
            </Card>

            {/* How to get a Groq API key */}
            <Card className="p-4">
              <button
                onClick={() => setShowHowto(!showHowto)}
                className="w-full flex items-center justify-between text-left cursor-pointer"
              >
                <div>
                  <div className="text-[11px] font-mono tracking-wider text-[var(--fg-mute)] uppercase mb-1">
                    Help
                  </div>
                  <div className="text-sm text-[var(--fg)] font-medium">
                    How to get a free Groq API key (~30 seconds)
                  </div>
                </div>
                <span className="text-[var(--fg-mute)] text-lg">
                  {showHowto ? "−" : "+"}
                </span>
              </button>

              {showHowto && (
                <div className="mt-4 space-y-3 text-xs text-[var(--fg-dim)] leading-relaxed">
                  <Step n={1}>
                    Go to{" "}
                    <a
                      href="https://console.groq.com"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[var(--accent)] hover:underline font-mono"
                    >
                      console.groq.com
                    </a>{" "}
                    and sign up. Free tier, no credit card. Sign in with
                    Google/GitHub for fastest signup.
                  </Step>
                  <Step n={2}>
                    Once logged in, click{" "}
                    <span className="text-[var(--fg)]">API Keys</span> in the
                    left sidebar (or go directly to{" "}
                    <a
                      href="https://console.groq.com/keys"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[var(--accent)] hover:underline font-mono"
                    >
                      console.groq.com/keys
                    </a>
                    ).
                  </Step>
                  <Step n={3}>
                    Click <span className="text-[var(--fg)]">Create API Key</span>
                    , give it any name (e.g. "curator"), and copy the key —
                    it starts with{" "}
                    <code className="text-[var(--fg-dim)]">gsk_</code>. You
                    only see it once, so save it somewhere if you want a
                    backup.
                  </Step>
                  <Step n={4}>
                    Paste the key into the API Key field above, hit{" "}
                    <span className="text-[var(--fg)]">SAVE</span>, then{" "}
                    <span className="text-[var(--fg)]">TEST CONNECTION</span>{" "}
                    to verify.
                  </Step>
                  <div className="pt-2 border-t border-[var(--border-soft)]">
                    <div className="text-[11px] text-[var(--fg-mute)] font-mono uppercase tracking-wider mb-1">
                      Free tier limits
                    </div>
                    <ul className="space-y-0.5 text-[var(--fg-mute)] text-[12px]">
                      <li>• 14,400 requests/day on llama-3.3-70b</li>
                      <li>• 30 requests/min</li>
                      <li>• ~6,000 tokens/min input, ~12,000 tokens/min output</li>
                      <li>
                        • Plenty for personal use — a typical Build call uses
                        ~6k tokens
                      </li>
                    </ul>
                  </div>
                </div>
              )}
            </Card>
          </>
        )}
      </div>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[11px] font-mono tracking-wider text-[var(--fg-mute)] uppercase mb-1">
      {children}
    </div>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <div className="h-5 w-5 rounded-sm bg-[var(--bg-elev-2)] border border-[var(--border)] text-[11px] font-mono font-bold text-[var(--accent)] flex items-center justify-center shrink-0">
        {n}
      </div>
      <div className="flex-1 pt-0.5">{children}</div>
    </div>
  );
}
