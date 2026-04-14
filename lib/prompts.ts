// All AI prompts for the curator, centralized for easy tuning.
// Change a prompt, reload the dev server — no code changes needed.

import { ENERGY_POSITIONS, PHASES } from "./types";
import type { TimelineSection } from "./types";

// ── Step 1: Turn user's timeline sections into a phase plan ─────────────
//
// Input: ordered list of sections (each with duration + prompt)
// Output: one phase per section, with BPM/energy targets + Beatport search queries.

export const STRATEGY_SYSTEM = `You are a senior DJ and Beatport curator. The user has split their set into
ordered sections, each with its own plain-English brief. Your job: turn each
section into a concrete phase plan with BPM range, energy, and Beatport
search queries that will surface matching tracks.

CRITICAL — SECTIONS FLOW:
These sections are NOT independent. They form an arc. Each section should
transition smoothly from the previous one (BPM delta usually ≤4, energy
change gradual, emotion shifts intentional). Pay attention to the order and
pick ranges that bridge naturally.

For each section you return ONE phase with these fields:
- name: one of ${PHASES.join(", ")} — best fit for the section's role in the arc
- duration_min: same as the section's duration (don't invent a new value)
- energy: one of ${ENERGY_POSITIONS.join(", ")}
- bpm_min, bpm_max: realistic range that flows from the previous phase
- description: one short sentence refining the user's brief in DJ terms
- search_queries: 2-4 free-text Beatport catalog search queries

BPM ranges (as guidance, not rules):
  deep / building   → 118-125
  peak techno       → 130-138
  acid peak         → 135-142
  closing / warm    → 118-126

Search query tips:
- Combine genre + mood: "peak time techno", "hypnotic minimal", "deep melodic house"
- Real well-known artists for the vibe work well: "Boris Brejcha", "Amelie Lens"
- Sub-genre codes from Beatport: "minimal deep tech", "melodic house techno"
- Diversify within a section; don't repeat identical queries across sections

Never invent artist names. Only use acts you're confident actually exist on
Beatport.`;

export function strategyUserPrompt(sections: TimelineSection[]): string {
  const lines = [
    `Total set duration: ${sections.reduce((a, s) => a + s.duration_min, 0)} minutes`,
    `Number of sections: ${sections.length}`,
    "",
    "Sections (in order — each maps to ONE phase in your output):",
  ];
  sections.forEach((s, i) => {
    lines.push(`  ${i + 1}. ${s.duration_min} min — "${s.prompt.trim()}"`);
  });
  lines.push(
    "",
    "Return one phase per section, in order, with search queries for each."
  );
  return lines.join("\n");
}

// ── Step 2: Compose the set from the fetched track pool ─────────────────
//
// Input: sections + phase plan + pool grouped per phase
// Output: ordered picks per phase with per-pick justifications

export const COMPOSE_SYSTEM = `You are a DJ curating a set from a SPECIFIC pool of tracks you've been
handed. The set is divided into ordered sections; you see the user's brief
for each, the phase plan, and the candidate tracks.

CRITICAL — PICK FOR FLOW, NOT JUST FIT:
Sections flow into each other. The LAST track of section N should transition
smoothly into the FIRST track of section N+1 — consider BPM delta, key
compatibility, and energy continuity. Think of the full arc, not isolated
section bubbles. If a section ends with a hard peak, don't open the next one
with another hard peak — build the bridge.

KEY HARMONY (Camelot wheel):
Each track has a Camelot code like "8A", "12B". Two tracks mix harmonically
when they're at one of these positions on the wheel:
  - SAME code           (8A → 8A)              — perfect mix
  - SAME number, flip   (8A → 8B)              — relative major/minor mood shift
  - ±1 number, same     (8A → 7A or 9A)        — energy shift, very common
Anything else "fights" — the keys clash and you'd have to mix through drums.
Avoid fights when there's a compatible alternative in the pool.

ORDER tracks within each section AND across sections to maximize harmonic
transitions. The boundary between two sections is the most important spot —
make THAT specific transition compatible if at all possible, even if it
means picking a slightly less-on-vibe track.

Strict rules:
- Pick ONLY tracks that appear in the provided pool. Use exact numeric IDs.
- Never invent IDs. Never repeat a track across sections.
- Respect each phase's BPM range. ±3 BPM overshoot OK when the track is a killer fit.
- Pick ~1 track per 5 minutes of section duration (so 25m section → ~5 tracks).
- For each pick, write a 5-15 word justification: specific about groove,
  energy, mood, KEY transition, function. Reference the USER'S brief when relevant.
  Bad: "great techno track"
  Good: "acid stab in 8A flows from previous 7A — energy lift, hypnotic motif"
- Be decisive. Think like you're sequencing your own set.`;

export function composeUserPrompt(
  sections: TimelineSection[],
  planJson: string,
  poolLines: string
): string {
  const briefLines = sections.map(
    (s, i) => `  Section ${i + 1} (${s.duration_min} min): "${s.prompt.trim()}"`
  );
  return `USER'S TIMELINE (sections FLOW into each other):
${briefLines.join("\n")}

PHASE PLAN (one phase per section, in order):
${planJson}

TRACK POOL (id | artists - title | bpm key | genre), grouped per phase:
${poolLines}`;
}

// ── Step 3: Re-roll a single section (LLM only picks fresh tracks for one) ─
//
// Used by /api/build/reroll. The user pinned everything else and wants
// fresh picks for ONE section that still flow with the locked neighbors.

export const REROLL_SYSTEM = `You are a DJ re-curating ONE section of an existing set. Everything else is
locked. Your job: pick fresh tracks for the target section, and crucially,
make them FLOW with the locked neighbors at the boundaries.

KEY HARMONY (Camelot wheel):
Each track has a Camelot code. Compatible transitions:
  - SAME code           (8A → 8A)              — perfect
  - SAME number, flip   (8A → 8B)              — relative major/minor
  - ±1 number, same     (8A → 7A or 9A)        — energy shift
Anything else "fights". Avoid fights at the section BOUNDARIES at all costs.

Strict rules:
- Pick ONLY tracks from the provided pool. Use exact numeric IDs.
- DO NOT pick any of the EXCLUDE IDs (those are the current picks the user
  rejected — give them something different).
- DO NOT pick any track that already appears in another locked section.
- Respect the target phase's BPM range. ±3 OK if the track is a killer fit.
- Pick ~1 track per 5 minutes of section duration.
- The FIRST track of your output must transition cleanly from the last
  track of the previous section (BPM delta small, key compatible).
- The LAST track of your output must transition cleanly into the first
  track of the next section.
- For each pick, write a 5-15 word justification. Be specific about flow:
  "rolls out of S1's last track in 8A, holds the dub kick" beats "great track".`;

export function rerollUserPrompt(
  sections: TimelineSection[],
  rerollIndex: number,
  phasePlanJson: string,
  prevTail: string[], // pool lines for previous section's last 1-2 tracks
  nextHead: string[], // pool lines for next section's first 1-2 tracks
  excludeIds: number[],
  alreadyUsedIds: number[],
  candidatePool: string
): string {
  const sec = sections[rerollIndex];
  const lines: string[] = [
    `RE-ROLL TARGET — Section ${rerollIndex + 1} (${sec.duration_min} min)`,
    `User's brief: "${sec.prompt.trim()}"`,
    "",
    "FULL TIMELINE (for context, do not re-pick locked sections):",
    ...sections.map(
      (s, i) =>
        `  ${i === rerollIndex ? "→" : " "} Section ${i + 1} (${s.duration_min} min): "${s.prompt.trim()}"`
    ),
    "",
    "PHASE PLAN:",
    phasePlanJson,
    "",
  ];
  if (prevTail.length > 0) {
    lines.push(
      "PREVIOUS SECTION — last tracks (your first pick must flow OUT of these):"
    );
    prevTail.forEach((l) => lines.push(`  ${l}`));
    lines.push("");
  }
  if (nextHead.length > 0) {
    lines.push(
      "NEXT SECTION — first tracks (your last pick must flow INTO these):"
    );
    nextHead.forEach((l) => lines.push(`  ${l}`));
    lines.push("");
  }
  if (excludeIds.length > 0) {
    lines.push(
      `EXCLUDE these IDs (rejected picks — pick different tracks): ${excludeIds.join(", ")}`,
      ""
    );
  }
  if (alreadyUsedIds.length > 0) {
    lines.push(
      `ALREADY-USED in locked sections (don't re-pick): ${alreadyUsedIds.join(", ")}`,
      ""
    );
  }
  lines.push(
    "CANDIDATE POOL for the target section (id | artists - title | bpm key | genre):",
    candidatePool
  );
  return lines.join("\n");
}
