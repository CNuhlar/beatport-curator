import { NextResponse } from "next/server";
import { z } from "zod";
import OpenAI from "openai";
import {
  PROVIDER_PRESETS,
  getSettings,
  saveSettings,
} from "@/lib/settings";

export const dynamic = "force-dynamic";

export async function GET() {
  const settings = await getSettings();
  return NextResponse.json({
    settings,
    presets: PROVIDER_PRESETS,
  });
}

const PatchSchema = z.object({
  provider: z.string().min(1).max(40).optional(),
  api_key: z.string().max(500).nullable().optional(),
  base_url: z.string().url().max(300).optional(),
  model: z.string().min(1).max(200).optional(),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const settings = await saveSettings(parsed.data);
  return NextResponse.json({ settings });
}

// Test the configured provider by making a tiny chat completion call.
export async function PUT() {
  const s = await getSettings();
  if (!s.api_key && s.provider !== "ollama") {
    return NextResponse.json(
      { ok: false, error: "No API key set" },
      { status: 400 }
    );
  }
  try {
    const client = new OpenAI({
      apiKey: s.api_key ?? "ollama",
      baseURL: s.base_url,
    });
    const start = Date.now();
    const resp = await client.chat.completions.create({
      model: s.model,
      max_tokens: 8,
      messages: [{ role: "user", content: "say ok" }],
    });
    const ms = Date.now() - start;
    const text = resp.choices[0]?.message?.content ?? "";
    return NextResponse.json({
      ok: true,
      latency_ms: ms,
      reply: text.slice(0, 60),
      model: s.model,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 500 }
    );
  }
}
