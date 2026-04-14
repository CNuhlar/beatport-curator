// Canonical vibe-dimension values. Source of truth for tagger + filters.

export const ENERGY_POSITIONS = [
  "deep",
  "building",
  "peak",
  "after-peak",
  "closing",
] as const;
export type EnergyPosition = (typeof ENERGY_POSITIONS)[number];

export const GROOVES = [
  "straight-4/4",
  "syncopated",
  "acid",
  "tribal",
  "broken",
  "minimal",
] as const;
export type Groove = (typeof GROOVES)[number];

export const EMOTIONS = [
  "hypnotic",
  "dark",
  "melancholic",
  "euphoric",
  "weird",
  "warm",
] as const;
export type Emotion = (typeof EMOTIONS)[number];

export const FUNCTIONS = [
  "floor-filler",
  "dj-tool",
  "crowd-stopper",
  "slow-burner",
] as const;
export type FunctionTag = (typeof FUNCTIONS)[number];

export const PHASES = ["warm-up", "build", "peak", "closing"] as const;
export type Phase = (typeof PHASES)[number];

// User-defined timeline section — each maps to one phase in the strategy.
export interface TimelineSection {
  duration_min: number;
  prompt: string;
}

// Builder intent, parsed from natural language by Claude.
export interface ParsedIntent {
  duration_min: number;
  phases: ParsedPhase[];
}

export interface ParsedPhase {
  name: Phase;
  duration_min: number;
  energy: EnergyPosition;
  bpm_min: number;
  bpm_max: number;
  grooves: Groove[];
  emotions: Emotion[];
  function_tags: FunctionTag[];
  description: string;
}

// Track tag result from Claude.
export interface TrackTags {
  energy_position: EnergyPosition;
  groove: Groove[];
  emotion: Emotion[];
  function_tag: FunctionTag;
  confidence: number;
  reasoning: string;
}
