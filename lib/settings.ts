// LLM provider settings — stored in an HttpOnly cookie (same pattern as
// the Beatport token). Server routes that call the LLM read the cookie
// via next/headers cookies(). The /settings page mutates it through
// /api/settings. No database.

import { cookies } from "next/headers";

const COOKIE_NAME = "curator_llm";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

export interface LLMSettings {
  provider: string;
  api_key: string | null;
  base_url: string;
  model: string;
}

// Built-in presets the UI offers as one-click choices.
export interface ProviderPreset {
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

export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: "groq",
    label: "Groq",
    base_url: "https://api.groq.com/openai/v1",
    default_model: "llama-3.3-70b-versatile",
    signup_url: "https://console.groq.com/keys",
    signup_label: "console.groq.com/keys",
    key_format: "gsk_...",
    free: true,
    description:
      "Free tier: 14,400 requests/day on llama-3.3-70b-versatile. Fastest option (~300 tok/s). Recommended.",
  },
  {
    id: "openai",
    label: "OpenAI",
    base_url: "https://api.openai.com/v1",
    default_model: "gpt-4o-mini",
    signup_url: "https://platform.openai.com/api-keys",
    signup_label: "platform.openai.com/api-keys",
    key_format: "sk-...",
    description: "Paid. Reliable, slower than Groq. Good for production.",
  },
  {
    id: "ollama",
    label: "Ollama (local)",
    base_url: "http://localhost:11434/v1",
    default_model: "llama3.1:8b",
    description:
      "Run an LLM locally. No API key needed. Slowest unless you have a GPU.",
  },
  {
    id: "custom",
    label: "Custom (OpenAI-compatible)",
    base_url: "",
    default_model: "",
    description: "Any OpenAI-compatible endpoint — bring your own URL/model.",
  },
];

const DEFAULTS: LLMSettings = {
  provider: "groq",
  api_key: null,
  base_url: "https://api.groq.com/openai/v1",
  model: "llama-3.3-70b-versatile",
};

// No env-var fallback — each visitor brings their own key via /settings
// and it lives in their own HttpOnly cookie. Keeps deployment private-
// key-free and per-user keys isolated.
export async function getSettings(): Promise<LLMSettings> {
  const store = await cookies();
  const raw = store.get(COOKIE_NAME)?.value;
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Partial<LLMSettings>;
      return {
        provider: parsed.provider ?? DEFAULTS.provider,
        api_key: parsed.api_key ?? null,
        base_url: parsed.base_url ?? DEFAULTS.base_url,
        model: parsed.model ?? DEFAULTS.model,
      };
    } catch {
      /* fall through */
    }
  }
  return DEFAULTS;
}

export async function saveSettings(
  patch: Partial<LLMSettings>
): Promise<LLMSettings> {
  const current = await getSettings();
  const next: LLMSettings = {
    provider: patch.provider ?? current.provider,
    api_key: patch.api_key !== undefined ? patch.api_key : current.api_key,
    base_url: patch.base_url ?? current.base_url,
    model: patch.model ?? current.model,
  };
  const store = await cookies();
  store.set(COOKIE_NAME, JSON.stringify(next), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: COOKIE_MAX_AGE,
    path: "/",
  });
  return next;
}

export async function isLLMConfigured(): Promise<boolean> {
  const s = await getSettings();
  if (s.provider === "ollama") return Boolean(s.base_url);
  return Boolean(s.api_key && s.api_key.length > 0);
}
