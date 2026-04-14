// LLM client for the curator.
//
// Two-stage on-demand flow:
//   1. extractStrategy(intent)  → phases + Beatport search queries per phase
//   2. composeSet(intent, plan, pool) → ordered picks with justifications
//
// Uses any OpenAI-compatible endpoint. Provider/key/model live in SQLite
// (lib/settings.ts) and are configured via the /settings page.

import OpenAI from "openai";
import { z } from "zod";
import {
  EMOTIONS,
  ENERGY_POSITIONS,
  FUNCTIONS,
  GROOVES,
  PHASES,
  type TimelineSection,
} from "./types";
import {
  COMPOSE_SYSTEM,
  REROLL_SYSTEM,
  STRATEGY_SYSTEM,
  composeUserPrompt,
  rerollUserPrompt,
  strategyUserPrompt,
} from "./prompts";
import { getSettings } from "./settings";

async function getClient(): Promise<{ client: OpenAI; model: string }> {
  const s = await getSettings();
  if (!s.api_key && s.provider !== "ollama") {
    throw new Error(
      "LLM API key not configured. Open Settings to add one."
    );
  }
  const client = new OpenAI({
    apiKey: s.api_key ?? "ollama",
    baseURL: s.base_url,
  });
  return { client, model: s.model };
}

// ── Step 1: strategy ─────────────────────────────────────────────────────

export const PhaseStrategySchema = z.object({
  name: z.enum(PHASES),
  duration_min: z.number().int().min(5).max(240),
  energy: z.enum(ENERGY_POSITIONS),
  bpm_min: z.number().int().min(80).max(200),
  bpm_max: z.number().int().min(80).max(200),
  description: z.string().min(1).max(200),
  search_queries: z.array(z.string().min(2).max(60)).min(1).max(5),
});

export const StrategySchema = z.object({
  duration_min: z.number().int().min(5).max(480),
  phases: z.array(PhaseStrategySchema).min(1).max(6),
});

export type Strategy = z.infer<typeof StrategySchema>;
export type PhaseStrategy = z.infer<typeof PhaseStrategySchema>;

const strategyToolSchema = {
  type: "object" as const,
  properties: {
    duration_min: { type: "integer" as const, minimum: 5, maximum: 480 },
    phases: {
      type: "array" as const,
      minItems: 1,
      maxItems: 6,
      items: {
        type: "object" as const,
        properties: {
          name: { type: "string" as const, enum: [...PHASES] },
          duration_min: { type: "integer" as const, minimum: 5, maximum: 240 },
          energy: { type: "string" as const, enum: [...ENERGY_POSITIONS] },
          bpm_min: { type: "integer" as const, minimum: 80, maximum: 200 },
          bpm_max: { type: "integer" as const, minimum: 80, maximum: 200 },
          description: { type: "string" as const, maxLength: 200 },
          search_queries: {
            type: "array" as const,
            items: { type: "string" as const, maxLength: 60 },
            minItems: 1,
            maxItems: 5,
          },
        },
        required: [
          "name",
          "duration_min",
          "energy",
          "bpm_min",
          "bpm_max",
          "description",
          "search_queries",
        ],
        additionalProperties: false,
      },
    },
  },
  required: ["duration_min", "phases"],
  additionalProperties: false,
};

export async function extractStrategy(
  sections: TimelineSection[]
): Promise<Strategy> {
  const { client, model } = await getClient();
  const resp = await client.chat.completions.create({
    model,
    temperature: 0.4,
    messages: [
      { role: "system", content: STRATEGY_SYSTEM },
      { role: "user", content: strategyUserPrompt(sections) },
    ],
    tools: [
      {
        type: "function",
        function: {
          name: "submit_strategy",
          description:
            "Submit the set strategy — phases with BPM/energy targets and Beatport search queries.",
          parameters: strategyToolSchema,
        },
      },
    ],
    tool_choice: { type: "function", function: { name: "submit_strategy" } },
  });

  const toolCall = resp.choices[0]?.message?.tool_calls?.[0];
  if (!toolCall || toolCall.type !== "function") {
    throw new Error("Model did not return a strategy tool call");
  }
  return StrategySchema.parse(JSON.parse(toolCall.function.arguments));
}

// ── Step 2: compose ──────────────────────────────────────────────────────

const ComposedPickSchema = z.object({
  id: z.number().int(),
  why: z.string().min(1).max(200),
});

const ComposedPhaseSchema = z.object({
  name: z.enum(PHASES),
  tracks: z.array(ComposedPickSchema).min(0).max(25),
});

export const ComposedSetSchema = z.object({
  phases: z.array(ComposedPhaseSchema).min(1).max(6),
});

export type ComposedSet = z.infer<typeof ComposedSetSchema>;
export type ComposedPick = z.infer<typeof ComposedPickSchema>;

const composeToolSchema = {
  type: "object" as const,
  properties: {
    phases: {
      type: "array" as const,
      minItems: 1,
      maxItems: 6,
      items: {
        type: "object" as const,
        properties: {
          name: { type: "string" as const, enum: [...PHASES] },
          tracks: {
            type: "array" as const,
            minItems: 0,
            maxItems: 25,
            items: {
              type: "object" as const,
              properties: {
                id: { type: "integer" as const },
                why: { type: "string" as const, maxLength: 200 },
              },
              required: ["id", "why"],
              additionalProperties: false,
            },
          },
        },
        required: ["name", "tracks"],
        additionalProperties: false,
      },
    },
  },
  required: ["phases"],
  additionalProperties: false,
};

export async function composeSet(
  sections: TimelineSection[],
  strategy: Strategy,
  poolLines: string
): Promise<ComposedSet> {
  const { client, model } = await getClient();
  const resp = await client.chat.completions.create({
    model,
    temperature: 0.5,
    messages: [
      { role: "system", content: COMPOSE_SYSTEM },
      {
        role: "user",
        content: composeUserPrompt(
          sections,
          JSON.stringify(strategy.phases, null, 2),
          poolLines
        ),
      },
    ],
    tools: [
      {
        type: "function",
        function: {
          name: "submit_composition",
          description:
            "Submit the final composition — ordered track picks per phase with justifications.",
          parameters: composeToolSchema,
        },
      },
    ],
    tool_choice: { type: "function", function: { name: "submit_composition" } },
  });

  const toolCall = resp.choices[0]?.message?.tool_calls?.[0];
  if (!toolCall || toolCall.type !== "function") {
    throw new Error("Model did not return a composition tool call");
  }
  return ComposedSetSchema.parse(JSON.parse(toolCall.function.arguments));
}

// ── Step 3: Reroll picks (single-section helper) ─────────────────────────

const RerollPicksSchema = z.object({
  tracks: z.array(ComposedPickSchema).min(0).max(25),
});

export type RerollPicks = z.infer<typeof RerollPicksSchema>;

const rerollToolSchema = {
  type: "object" as const,
  properties: {
    tracks: {
      type: "array" as const,
      minItems: 0,
      maxItems: 25,
      items: {
        type: "object" as const,
        properties: {
          id: { type: "integer" as const },
          why: { type: "string" as const, maxLength: 200 },
        },
        required: ["id", "why"],
        additionalProperties: false,
      },
    },
  },
  required: ["tracks"],
  additionalProperties: false,
};

export async function rerollSectionLLM(
  sections: TimelineSection[],
  rerollIndex: number,
  phasePlanJson: string,
  prevTail: string[],
  nextHead: string[],
  excludeIds: number[],
  alreadyUsedIds: number[],
  candidatePool: string
): Promise<RerollPicks> {
  const { client, model } = await getClient();
  const resp = await client.chat.completions.create({
    model,
    temperature: 0.6,
    messages: [
      { role: "system", content: REROLL_SYSTEM },
      {
        role: "user",
        content: rerollUserPrompt(
          sections,
          rerollIndex,
          phasePlanJson,
          prevTail,
          nextHead,
          excludeIds,
          alreadyUsedIds,
          candidatePool
        ),
      },
    ],
    tools: [
      {
        type: "function",
        function: {
          name: "submit_reroll",
          description:
            "Submit fresh picks for the target section that flow with locked neighbors.",
          parameters: rerollToolSchema,
        },
      },
    ],
    tool_choice: { type: "function", function: { name: "submit_reroll" } },
  });

  const toolCall = resp.choices[0]?.message?.tool_calls?.[0];
  if (!toolCall || toolCall.type !== "function") {
    throw new Error("Model did not return a reroll tool call");
  }
  return RerollPicksSchema.parse(JSON.parse(toolCall.function.arguments));
}
