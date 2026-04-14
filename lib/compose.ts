// On-demand playlist composer.
//
// 1. Ask LLM for a phase plan + Beatport search queries per phase.
// 2. Fan out Beatport searches in parallel → dedupe → pool.
// 3. Ask LLM to pick ordered tracks from pool for each phase.
// 4. Annotate consecutive picks with transition notes (Camelot + BPM delta).

import { searchTracks, type BeatportTrack } from "./beatport";
import {
  composeSet,
  extractStrategy,
  rerollSectionLLM,
  type PhaseStrategy,
  type Strategy,
} from "./claude";
import type { TimelineSection } from "./types";
import {
  describeTransition,
  toCamelot,
  transitionQuality,
  type TransitionQuality,
} from "./camelot";

// Leaner shape the UI and exporter consume.
export interface PoolTrack {
  id: number;
  name: string;
  mix_name: string | null;
  artists: string[];
  label: string | null;
  genre: string | null;
  bpm: number | null;
  key_name: string | null;
  camelot: string | null;
  length_ms: number | null;
  image_url: string | null;
  slug: string | null;
  sample_url: string | null;
  sample_start_ms: number | null;
  sample_end_ms: number | null;
}

export interface BuiltPick {
  track: PoolTrack;
  why: string;
  transition_note: string;
}

export interface BuiltPhase {
  phase: PhaseStrategy;
  tracks: BuiltPick[];
}

export interface BuildResult {
  strategy: Strategy;
  phases: BuiltPhase[];
  pool_size: number;
}

export type ProgressEvent =
  | { type: "strategy_start" }
  | { type: "strategy_done"; phases: number; queries: number }
  | { type: "search_start"; query: string }
  | { type: "search_done"; query: string; count: number }
  | { type: "pool_ready"; size: number }
  | { type: "compose_start" }
  | { type: "compose_done"; picks: number };

type Emit = (ev: ProgressEvent) => void;

// ── Helpers ──────────────────────────────────────────────────────────────

function flattenTrack(bt: BeatportTrack): PoolTrack {
  const cam =
    bt.key?.camelot_number && bt.key?.camelot_letter
      ? `${bt.key.camelot_number}${bt.key.camelot_letter}`
      : toCamelot(bt.key?.name);
  return {
    id: bt.id,
    name: bt.name,
    mix_name: bt.mix_name ?? null,
    artists: (bt.artists ?? []).map((a) => a.name),
    label: bt.release?.label?.name ?? null,
    genre: bt.sub_genre?.name ?? bt.genre?.name ?? null,
    bpm: bt.bpm ?? null,
    key_name: bt.key?.name ?? null,
    camelot: cam,
    length_ms: bt.length_ms ?? null,
    image_url:
      bt.release?.image?.uri ??
      bt.image?.uri ??
      null,
    slug: bt.slug ?? null,
    sample_url: bt.sample_url ?? null,
    sample_start_ms: bt.sample_start_ms ?? null,
    sample_end_ms: bt.sample_end_ms ?? null,
  };
}

/**
 * Normalized identity key for dedup: same (artists, name) regardless of
 * mix_name, BPM, or track ID. Beatport often returns multiple "editions"
 * of the same song — original mix, extended mix, remastered — which
 * share artists + name but differ by 1-2 BPM and mix label. The user
 * never wants both in the same playlist.
 */
function dedupeKey(t: PoolTrack): string {
  const artists = [...t.artists]
    .map((a) => a.trim().toLowerCase())
    .sort()
    .join(",");
  const name = t.name.trim().toLowerCase();
  return `${artists}|${name}`;
}

/**
 * Run many Beatport searches in parallel with a concurrency cap.
 * Returns a deduped map keyed by track ID. Also dedupes by normalized
 * (artists, name) so we don't end up with two editions of the same song.
 * Emits search_start/search_done events per query if `emit` is provided.
 */
async function fetchPool(
  queries: string[],
  emit?: Emit,
  perQuery = 25
): Promise<Map<number, PoolTrack>> {
  const unique = Array.from(new Set(queries.map((q) => q.trim().toLowerCase())))
    .filter((q) => q.length > 0);

  const pool = new Map<number, PoolTrack>();
  const seenIdentity = new Set<string>();
  const concurrency = 5;
  let idx = 0;

  async function worker() {
    while (idx < unique.length) {
      const q = unique[idx++];
      emit?.({ type: "search_start", query: q });
      try {
        const { tracks } = await searchTracks(q, 1, perQuery);
        for (const t of tracks) {
          if (pool.has(t.id)) continue;
          const mapped = flattenTrack(t);
          const key = dedupeKey(mapped);
          if (seenIdentity.has(key)) continue;
          seenIdentity.add(key);
          pool.set(t.id, mapped);
        }
        emit?.({ type: "search_done", query: q, count: tracks.length });
      } catch (e) {
        console.error(`[compose] search failed for "${q}":`, (e as Error).message);
        emit?.({ type: "search_done", query: q, count: 0 });
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, unique.length) }, worker)
  );
  return pool;
}

// ── Reorder helpers ──────────────────────────────────────────────────────
//
// Hard rule: tracks within a section must be ascending by BPM.
// Soft rule: prefer Camelot-compatible neighbors (perfect/energy/mood > fight).
// We achieve this by stable-sorting on BPM, then doing micro-swaps between
// adjacent tracks whose BPMs differ by ≤2 (still "ascending" within rounding)
// when the swap improves the camelot transition. The boundary between two
// sections gets a final fix attempt — first track of section B can be
// swapped with another low-BPM candidate to remove a "fight" with the last
// track of section A.

function rankTransition(q: TransitionQuality): number {
  switch (q) {
    case "perfect":
      return 0;
    case "energy":
      return 1;
    case "mood":
      return 2;
    default:
      return 3;
  }
}

const BPM_TIE_TOLERANCE = 2; // swap within this BPM delta
const BOUNDARY_BPM_WINDOW = 3; // candidate window for boundary swaps

/**
 * STRICT CAMELOT CHAIN — every consecutive pair MUST be camelot-compatible.
 * Greedy: start from the prev anchor (or the lowest-BPM track with no
 * anchor), then at each step pick the most ascending-BPM compatible
 * candidate. Drops any track that has no compatible place in the chain.
 */
function reorderStrictCamelot(
  phase: BuiltPhase,
  prevAnchor: PoolTrack | null,
  nextAnchor: PoolTrack | null
): BuiltPhase {
  const remaining = [...phase.tracks];
  const result: BuiltPick[] = [];
  let current: PoolTrack | null = prevAnchor;

  while (remaining.length > 0) {
    // Build the compatible candidate set
    const compatible: BuiltPick[] = [];
    for (const pick of remaining) {
      if (current == null) {
        compatible.push(pick);
      } else if (
        transitionQuality(current.camelot, pick.track.camelot) !== "fight"
      ) {
        compatible.push(pick);
      }
    }
    if (compatible.length === 0) break;

    // Sort preference:
    //   1. BPM ≥ current (ascending bias)
    //   2. Smallest absolute BPM delta
    //   3. Highest camelot quality
    const curBpm = current?.bpm ?? null;
    compatible.sort((a, b) => {
      if (curBpm == null) {
        return (a.track.bpm ?? 0) - (b.track.bpm ?? 0);
      }
      const aDelta = (a.track.bpm ?? curBpm) - curBpm;
      const bDelta = (b.track.bpm ?? curBpm) - curBpm;
      const aAsc = aDelta >= 0 ? 0 : 1;
      const bAsc = bDelta >= 0 ? 0 : 1;
      if (aAsc !== bAsc) return aAsc - bAsc;
      if (Math.abs(aDelta) !== Math.abs(bDelta))
        return Math.abs(aDelta) - Math.abs(bDelta);
      if (current) {
        const qA = rankTransition(
          transitionQuality(current.camelot, a.track.camelot)
        );
        const qB = rankTransition(
          transitionQuality(current.camelot, b.track.camelot)
        );
        return qA - qB;
      }
      return 0;
    });

    const chosen = compatible[0];
    result.push(chosen);
    const idx = remaining.indexOf(chosen);
    if (idx >= 0) remaining.splice(idx, 1);
    current = chosen.track;
  }

  // If the final track can't chain into the NEXT section's first track,
  // try to back-swap with an earlier pick that CAN.
  if (nextAnchor && result.length >= 2) {
    const last = result[result.length - 1].track;
    if (transitionQuality(last.camelot, nextAnchor.camelot) === "fight") {
      for (let i = result.length - 2; i >= 0; i--) {
        const cand = result[i].track;
        if (
          transitionQuality(cand.camelot, nextAnchor.camelot) !== "fight" &&
          // and the new tail still chains from result[i-1]
          (i === 0 ||
            transitionQuality(
              result[i - 1].track.camelot,
              cand.camelot
            ) !== "fight")
        ) {
          // Swap is only a soft improvement — drop tracks after i
          // that would break the chain. Simple approach: move `cand` to the
          // end and rebuild the chain from there. Too invasive for a micro-
          // fix; skip unless it's trivially safe (just swap i and last).
          const tmp = result[result.length - 1];
          result[result.length - 1] = result[i];
          result[i] = tmp;
          // Verify the chain still holds; if not, revert.
          let chainOk = true;
          let p: PoolTrack | null = prevAnchor;
          for (const pt of result) {
            if (p && transitionQuality(p.camelot, pt.track.camelot) === "fight") {
              chainOk = false;
              break;
            }
            p = pt.track;
          }
          if (!chainOk) {
            // revert
            const r = result[result.length - 1];
            result[result.length - 1] = result[i];
            result[i] = r;
          }
          break;
        }
      }
    }
  }

  // Recompute transition notes
  let prev: PoolTrack | null = prevAnchor;
  for (const pt of result) {
    pt.transition_note = prev
      ? describeTransition(prev.camelot, pt.track.camelot, prev.bpm, pt.track.bpm)
      : "opener";
    prev = pt.track;
  }

  return { ...phase, tracks: result };
}

function reorderOneSection(
  phase: BuiltPhase,
  prevAnchor: PoolTrack | null,
  nextAnchor: PoolTrack | null,
  strict = false
): BuiltPhase {
  if (strict) return reorderStrictCamelot(phase, prevAnchor, nextAnchor);
  // 1. Sort ascending by BPM (stable). null BPM → 0 (sinks to top).
  const tracks = [...phase.tracks].sort(
    (a, b) => (a.track.bpm ?? 0) - (b.track.bpm ?? 0)
  );

  // 2. In-section camelot tweak — swap adjacent tracks at near-equal BPM
  //    when it improves the camelot quality with the previous track.
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < tracks.length - 1; i++) {
      const prev = i > 0 ? tracks[i - 1].track : prevAnchor;
      if (!prev) continue;
      const cur = tracks[i].track;
      const next = tracks[i + 1].track;
      if (Math.abs((cur.bpm ?? 0) - (next.bpm ?? 0)) > BPM_TIE_TOLERANCE)
        continue;
      const qCur = rankTransition(
        transitionQuality(prev.camelot, cur.camelot)
      );
      const qSwap = rankTransition(
        transitionQuality(prev.camelot, next.camelot)
      );
      if (qSwap < qCur) {
        [tracks[i], tracks[i + 1]] = [tracks[i + 1], tracks[i]];
      }
    }
  }

  // 3a. Boundary fix — head: if first track clashes with prevAnchor, try to
  //     swap it with another low-BPM track that doesn't clash.
  if (prevAnchor && tracks.length >= 2) {
    const first = tracks[0].track;
    if (transitionQuality(prevAnchor.camelot, first.camelot) === "fight") {
      const bpm0 = first.bpm ?? 0;
      for (let j = 1; j < tracks.length; j++) {
        const cand = tracks[j].track;
        if (Math.abs((cand.bpm ?? 0) - bpm0) > BOUNDARY_BPM_WINDOW) break;
        if (transitionQuality(prevAnchor.camelot, cand.camelot) !== "fight") {
          [tracks[0], tracks[j]] = [tracks[j], tracks[0]];
          break;
        }
      }
    }
  }

  // 3b. Boundary fix — tail: if last track clashes with nextAnchor, try to
  //     swap it with another high-BPM track that doesn't clash.
  if (nextAnchor && tracks.length >= 2) {
    const lastIdx = tracks.length - 1;
    const last = tracks[lastIdx].track;
    if (transitionQuality(last.camelot, nextAnchor.camelot) === "fight") {
      const bpmL = last.bpm ?? 0;
      for (let j = lastIdx - 1; j >= 0; j--) {
        const cand = tracks[j].track;
        if (Math.abs((cand.bpm ?? 0) - bpmL) > BOUNDARY_BPM_WINDOW) break;
        if (transitionQuality(cand.camelot, nextAnchor.camelot) !== "fight") {
          [tracks[lastIdx], tracks[j]] = [tracks[j], tracks[lastIdx]];
          break;
        }
      }
    }
  }

  // 4. Recompute transition_notes after any reordering
  let prev: PoolTrack | null = prevAnchor;
  for (const pt of tracks) {
    pt.transition_note = prev
      ? describeTransition(prev.camelot, pt.track.camelot, prev.bpm, pt.track.bpm)
      : "opener";
    prev = pt.track;
  }

  return { ...phase, tracks };
}

/**
 * After the LLM has picked and strict reorder has chained them, some
 * sections may still be under-filled (strict drops incompatible picks).
 * Walk the full pool for each short phase and GREEDILY append more
 * compatible tracks until the target count is reached, using ascending-
 * BPM + camelot-compat rules. Picks added this way are marked as
 * "auto-filled" so the UI can distinguish them from LLM picks.
 */
const AVG_TRACK_MIN = 5;

function topUpStrictChain(
  phases: BuiltPhase[],
  pool: Map<number, PoolTrack>,
  sections: TimelineSection[],
  initialAnchor: PoolTrack | null = null
): BuiltPhase[] {
  const used = new Set<number>();
  for (const phase of phases) {
    for (const pt of phase.tracks) used.add(pt.track.id);
  }

  let prevTail: PoolTrack | null = initialAnchor;
  for (let i = 0; i < phases.length; i++) {
    const phase = phases[i];
    const section = sections[i];
    if (!section) continue;
    const target = Math.max(1, Math.ceil(section.duration_min / AVG_TRACK_MIN));

    if (phase.tracks.length >= target) {
      prevTail = phase.tracks[phase.tracks.length - 1]?.track ?? prevTail;
      continue;
    }

    // Candidate pool for this phase — unused tracks in BPM range
    const lo = phase.phase.bpm_min - 4;
    const hi = phase.phase.bpm_max + 4;
    const basePool: PoolTrack[] = [];
    for (const t of pool.values()) {
      if (used.has(t.id)) continue;
      if (t.bpm != null && (t.bpm < lo || t.bpm > hi)) continue;
      basePool.push(t);
    }

    let tail: PoolTrack | null =
      phase.tracks[phase.tracks.length - 1]?.track ?? prevTail;
    const needed = target - phase.tracks.length;

    for (let k = 0; k < needed; k++) {
      // Filter compatible with current tail
      const compat = basePool.filter((t) => {
        if (used.has(t.id)) return false;
        if (tail == null) return true;
        return transitionQuality(tail.camelot, t.camelot) !== "fight";
      });
      if (compat.length === 0) break;

      // Sort by ascending BPM bias, then closest BPM, then best camelot quality
      const curBpm = tail?.bpm ?? null;
      compat.sort((a, b) => {
        if (curBpm == null) return (a.bpm ?? 0) - (b.bpm ?? 0);
        const aD = (a.bpm ?? curBpm) - curBpm;
        const bD = (b.bpm ?? curBpm) - curBpm;
        const aAsc = aD >= 0 ? 0 : 1;
        const bAsc = bD >= 0 ? 0 : 1;
        if (aAsc !== bAsc) return aAsc - bAsc;
        if (Math.abs(aD) !== Math.abs(bD))
          return Math.abs(aD) - Math.abs(bD);
        if (tail) {
          const qA = rankTransition(
            transitionQuality(tail.camelot, a.camelot)
          );
          const qB = rankTransition(
            transitionQuality(tail.camelot, b.camelot)
          );
          return qA - qB;
        }
        return 0;
      });

      const chosen = compat[0];
      used.add(chosen.id);
      const transition = tail
        ? describeTransition(tail.camelot, chosen.camelot, tail.bpm, chosen.bpm)
        : "opener";
      phase.tracks.push({
        track: chosen,
        why: "auto-filled · camelot-chain match",
        transition_note: transition,
      });
      tail = chosen;
    }

    prevTail = tail;
  }

  return phases;
}

function reorderPhases(
  phases: BuiltPhase[],
  strict = false
): BuiltPhase[] {
  const out: BuiltPhase[] = [];
  let prevAnchor: PoolTrack | null = null;
  for (let i = 0; i < phases.length; i++) {
    let nextAnchor: PoolTrack | null = null;
    const next = phases[i + 1];
    if (next && next.tracks.length > 0) {
      const sortedNext = [...next.tracks].sort(
        (a, b) => (a.track.bpm ?? 0) - (b.track.bpm ?? 0)
      );
      nextAnchor = sortedNext[0].track;
    }
    const reordered = reorderOneSection(
      phases[i],
      prevAnchor,
      nextAnchor,
      strict
    );
    out.push(reordered);
    if (reordered.tracks.length > 0) {
      prevAnchor = reordered.tracks[reordered.tracks.length - 1].track;
    }
  }
  return out;
}

function formatPoolLine(t: PoolTrack): string {
  const artists = t.artists.join(", ");
  const mix = t.mix_name && t.mix_name !== "Original Mix" ? ` (${t.mix_name})` : "";
  const bpm = t.bpm ? `${t.bpm}bpm` : "?bpm";
  const key = t.camelot ?? "?";
  const genre = t.genre ?? "?";
  return `${t.id} | ${artists} - ${t.name}${mix} | ${bpm} ${key} | ${genre}`;
}

/**
 * Filter the pool to tracks loosely matching a phase's BPM range (±4),
 * so the LLM sees fewer candidates and makes cleaner picks.
 * `cap` controls how many candidates the LLM sees per phase — bumped up
 * when strict camelot is on (more options → better chance of filling the
 * compatible chain).
 */
function phaseCandidates(
  phase: PhaseStrategy,
  pool: Map<number, PoolTrack>,
  excluded: Set<number>,
  cap = 60
): PoolTrack[] {
  const lo = phase.bpm_min - 4;
  const hi = phase.bpm_max + 4;
  const out: PoolTrack[] = [];
  for (const t of pool.values()) {
    if (excluded.has(t.id)) continue;
    if (t.bpm == null) {
      out.push(t);
      continue;
    }
    if (t.bpm >= lo && t.bpm <= hi) out.push(t);
  }
  return out.slice(0, cap);
}

// ── Main entry point ─────────────────────────────────────────────────────

export async function composeOnDemand(
  sections: TimelineSection[],
  opts: { onProgress?: Emit; forceCamelot?: boolean } = {}
): Promise<BuildResult> {
  const emit: Emit = opts.onProgress ?? (() => {});
  const strict = !!opts.forceCamelot;

  // 1. Strategy: phase plan + search queries (one phase per user section)
  emit({ type: "strategy_start" });
  const strategy = await extractStrategy(sections);
  const allQueries = strategy.phases.flatMap((p) => p.search_queries);
  emit({
    type: "strategy_done",
    phases: strategy.phases.length,
    queries: allQueries.length,
  });

  // 2. Fetch pool — every query across every phase, deduped.
  //    Strict mode pulls more per query to give the camelot chain more
  //    tracks to work with. Capped to stay within Groq free-tier TPM
  //    (12k/min for llama-3.3-70b) — final compose prompt should land
  //    around ~9-10k input tokens in strict mode.
  const perQuery = strict ? 60 : 25;
  const pool = await fetchPool(allQueries, emit, perQuery);

  if (pool.size === 0) {
    throw new Error(
      "No tracks found on Beatport for these search terms. Try different section prompts."
    );
  }
  emit({ type: "pool_ready", size: pool.size });

  // 3. Compose: format pool per phase, ask LLM to pick (sections flow!)
  const picked = new Set<number>();
  const phaseLines: string[] = [];
  const phaseCap = strict ? 80 : 60;
  strategy.phases.forEach((p, i) => {
    const cand = phaseCandidates(p, pool, new Set(), phaseCap);
    const sec = sections[i];
    phaseLines.push(
      `### Phase ${i + 1}: ${p.name} — ${sec?.duration_min ?? p.duration_min} min — BPM ${p.bpm_min}-${p.bpm_max}`,
      ...cand.map(formatPoolLine)
    );
  });
  const poolText = phaseLines.join("\n");

  emit({ type: "compose_start" });
  const composed = await composeSet(sections, strategy, poolText);

  // 4. Annotate phases with transition notes
  const builtPhases: BuiltPhase[] = [];
  let prev: PoolTrack | null = null;

  for (const cphase of composed.phases) {
    const phase = strategy.phases.find((p) => p.name === cphase.name);
    if (!phase) continue;

    const tracks: BuiltPick[] = [];
    for (const pick of cphase.tracks) {
      const t = pool.get(pick.id);
      if (!t) continue;
      if (picked.has(t.id)) continue;
      picked.add(t.id);

      const transition = prev
        ? describeTransition(prev.camelot, t.camelot, prev.bpm, t.bpm)
        : "opener";

      tracks.push({ track: t, why: pick.why, transition_note: transition });
      prev = t;
    }
    builtPhases.push({ phase, tracks });
  }

  // 5. Reorder. In loose mode: BPM-asc within each section + camelot-aware
  //    micro-swaps + boundary fixes. In strict mode: greedy pure-camelot
  //    chain (incompatible tracks get dropped).
  let orderedPhases = reorderPhases(builtPhases, strict);

  // 5b. In strict mode, top up under-filled sections by walking the rest
  //     of the pool for compatible tracks. LLM picks are the spine;
  //     auto-fill turns a short chain into a fully-filled set.
  if (strict) {
    orderedPhases = topUpStrictChain(orderedPhases, pool, sections);
  }

  const totalPicks = orderedPhases.reduce((a, p) => a + p.tracks.length, 0);
  emit({ type: "compose_done", picks: totalPicks });

  return { strategy, phases: orderedPhases, pool_size: pool.size };
}

// ── Re-roll one section ──────────────────────────────────────────────────

export interface RerollResult {
  section_index: number;
  phase: PhaseStrategy;
  tracks: BuiltPick[];
  pool_size: number;
}

/**
 * Re-roll a single section. Locked neighbors stay, target section gets
 * fresh picks that flow with the boundaries.
 *
 * @param sections   The full timeline (unchanged).
 * @param lockedPicks Per-section picks for every section EXCEPT the target.
 *                    Used as flow context + already-used exclusion list.
 * @param rerollIndex Which section to re-roll.
 * @param excludeIds  Track IDs from the CURRENT picks of the target section
 *                    that should not be picked again.
 */
export async function rerollSection(
  sections: TimelineSection[],
  lockedPicks: Record<number, PoolTrack[]>,
  rerollIndex: number,
  excludeIds: number[],
  opts: { onProgress?: Emit; forceCamelot?: boolean } = {}
): Promise<RerollResult> {
  const emit: Emit = opts.onProgress ?? (() => {});
  const strict = !!opts.forceCamelot;

  // 1. Fresh strategy for the whole timeline (cheap, ~1 LLM call)
  emit({ type: "strategy_start" });
  const strategy = await extractStrategy(sections);
  const allQueries = strategy.phases.flatMap((p) => p.search_queries);
  emit({
    type: "strategy_done",
    phases: strategy.phases.length,
    queries: allQueries.length,
  });

  // 2. Pool — same as full build. Strict mode pulls more per query.
  const perQuery = strict ? 60 : 25;
  const pool = await fetchPool(allQueries, emit, perQuery);
  if (pool.size === 0) {
    throw new Error("No tracks found on Beatport for these search terms.");
  }
  emit({ type: "pool_ready", size: pool.size });

  const targetPhase = strategy.phases[rerollIndex];
  if (!targetPhase) {
    throw new Error(`Invalid section index ${rerollIndex}`);
  }

  // 3. Filter pool to candidates for the TARGET section, minus already-
  //    locked tracks. Reroll is a single-section LLM call so we can afford
  //    to show more candidates than compose's multi-section view.
  const alreadyUsed = new Set<number>();
  for (const [idx, picks] of Object.entries(lockedPicks)) {
    if (Number(idx) === rerollIndex) continue;
    for (const t of picks) alreadyUsed.add(t.id);
  }
  const phaseCap = strict ? 150 : 60;
  const cands = phaseCandidates(targetPhase, pool, alreadyUsed, phaseCap)
    .filter((t) => !excludeIds.includes(t.id))
    .slice(0, phaseCap);

  // Boundary context — last 2 picks of prev section, first 2 of next
  const prevPicks = lockedPicks[rerollIndex - 1] ?? [];
  const nextPicks = lockedPicks[rerollIndex + 1] ?? [];
  const prevTail = prevPicks.slice(-2).map(formatPoolLine);
  const nextHead = nextPicks.slice(0, 2).map(formatPoolLine);

  emit({ type: "compose_start" });
  const reroll = await rerollSectionLLM(
    sections,
    rerollIndex,
    JSON.stringify(strategy.phases, null, 2),
    prevTail,
    nextHead,
    excludeIds,
    Array.from(alreadyUsed),
    cands.map(formatPoolLine).join("\n")
  );

  // 4. Build raw picks (transition_note will be re-set by reorder)
  const rawTracks: BuiltPick[] = [];
  for (const pick of reroll.tracks) {
    const t = pool.get(pick.id);
    if (!t) continue;
    if (alreadyUsed.has(t.id)) continue;
    if (excludeIds.includes(t.id)) continue;
    rawTracks.push({ track: t, why: pick.why, transition_note: "" });
  }

  // 5. Reorder ONE section — loose or strict-camelot, anchored to the
  //    locked neighbors so boundary conditions respect what's pinned.
  const prevAnchor = prevPicks[prevPicks.length - 1] ?? null;
  const nextAnchor = nextPicks[0] ?? null;
  let reordered = reorderOneSection(
    { phase: targetPhase, tracks: rawTracks },
    prevAnchor,
    nextAnchor,
    strict
  );

  // 5b. Strict top-up for reroll: extend the chain from the unused pool
  //     if the section came out short. Uses the same anchor context.
  if (strict) {
    const locked = new Set<number>();
    for (const picks of Object.values(lockedPicks)) {
      for (const t of picks) locked.add(t.id);
    }
    for (const pt of reordered.tracks) locked.add(pt.track.id);
    const [topped] = topUpStrictChain(
      [reordered],
      pool,
      [sections[rerollIndex]],
      prevAnchor
    );
    reordered = topped;
  }

  emit({ type: "compose_done", picks: reordered.tracks.length });

  return {
    section_index: rerollIndex,
    phase: targetPhase,
    tracks: reordered.tracks,
    pool_size: pool.size,
  };
}

// ── Edit an existing playlist — reroll individual tracks ─────────────────

export interface EditReplacement {
  old_id: number;
  new_track: PoolTrack;
  why: string;
  transition_note: string;
}

export interface EditRerollResult {
  replacements: EditReplacement[];
  pool_size: number;
  /** Synthesized brief (useful for debug / showing the user what the
   *  model was told when they left the prompt blank). */
  brief: string;
}

function pickDominantGenre(tracks: PoolTrack[]): string | null {
  const counts = new Map<string, number>();
  for (const t of tracks) {
    if (!t.genre) continue;
    counts.set(t.genre, (counts.get(t.genre) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [g, c] of counts) {
    if (c > bestCount) {
      best = g;
      bestCount = c;
    }
  }
  return best;
}

/**
 * Reroll selected tracks inside an existing playlist. The AI reads the
 * rest of the playlist for context:
 *   - BPM range (min/max from locked tracks)
 *   - Dominant genre
 *   - Per-slot neighbor camelot for compatibility picks
 *
 * If `userPrompt` is provided, it's used as the reroll brief. Otherwise
 * a brief is synthesized from the locked-track stats so the AI still has
 * something concrete to search for.
 *
 * Picking is algorithmic (neighbor-aware greedy on BPM + camelot) — the
 * LLM's job is to generate good Beatport search queries for the brief.
 */
export async function editReroll(
  playlist: PoolTrack[],
  rerollIds: number[],
  userPrompt: string | null,
  opts: { forceCamelot?: boolean; onProgress?: Emit } = {}
): Promise<EditRerollResult> {
  const emit: Emit = opts.onProgress ?? (() => {});
  const strict = !!opts.forceCamelot;

  const rerollSet = new Set(rerollIds);
  const lockedTracks = playlist.filter((t) => !rerollSet.has(t.id));
  const targetTracks = playlist.filter((t) => rerollSet.has(t.id));

  if (targetTracks.length === 0) {
    throw new Error("No tracks selected for reroll");
  }

  // ── Playlist stats from LOCKED context ──────────────────────────
  const bpms = lockedTracks
    .map((t) => t.bpm)
    .filter((b): b is number => b != null);
  const bpmMin = bpms.length ? Math.min(...bpms) : 118;
  const bpmMax = bpms.length ? Math.max(...bpms) : 132;
  const topGenre = pickDominantGenre(lockedTracks);

  // ── Synthesize brief ────────────────────────────────────────────
  const trimmed = userPrompt?.trim() ?? "";
  const brief = trimmed
    ? `${trimmed}. Must fit a set already in ${topGenre ?? "this genre"}, BPM ${bpmMin}-${bpmMax}.`
    : `${topGenre ?? "techno"} tracks, BPM ${bpmMin}-${bpmMax}, matching the vibe and flow of a set that's already built. Pick fresh alternatives that blend with the surrounding tracks.`;

  const section: TimelineSection = {
    duration_min: Math.max(15, targetTracks.length * 6),
    prompt: brief,
  };

  // ── Strategy → pool ─────────────────────────────────────────────
  emit({ type: "strategy_start" });
  const strategy = await extractStrategy([section]);
  const allQueries = strategy.phases.flatMap((p) => p.search_queries);
  emit({
    type: "strategy_done",
    phases: strategy.phases.length,
    queries: allQueries.length,
  });

  const perQuery = strict ? 60 : 30;
  const pool = await fetchPool(allQueries, emit, perQuery);
  if (pool.size === 0) {
    throw new Error(
      "No tracks found on Beatport for this brief. Try a different prompt."
    );
  }
  emit({ type: "pool_ready", size: pool.size });

  // Remove tracks already in the playlist — we never want a reroll to
  // pick one of the existing rows.
  for (const t of playlist) pool.delete(t.id);

  // ── Per-slot neighbor-aware pick ────────────────────────────────
  emit({ type: "compose_start" });
  const replacements: EditReplacement[] = [];
  const usedIds = new Set<number>();

  // Working copy of the playlist with replacements applied as we go —
  // lets subsequent slot picks see already-chosen rerolls as neighbors,
  // so a run of consecutive rerolled slots still chains.
  const working: PoolTrack[] = [...playlist];

  for (let i = 0; i < working.length; i++) {
    const original = working[i];
    if (!rerollSet.has(original.id)) continue;

    const prevNeighbor = i > 0 ? working[i - 1] : null;
    const nextNeighbor = i < working.length - 1 ? working[i + 1] : null;

    // Target BPM: prefer the original's BPM, fall back to prev neighbor
    // or the center of the locked-BPM range.
    const targetBpm =
      original.bpm ??
      prevNeighbor?.bpm ??
      Math.round((bpmMin + bpmMax) / 2);
    const bpmWindow = strict ? 5 : 6;

    let candidates: PoolTrack[] = [];
    for (const t of pool.values()) {
      if (usedIds.has(t.id)) continue;
      if (t.bpm != null && Math.abs(t.bpm - targetBpm) > bpmWindow) continue;
      if (strict && prevNeighbor) {
        if (transitionQuality(prevNeighbor.camelot, t.camelot) === "fight")
          continue;
      }
      candidates.push(t);
    }

    // Fallback: if strict filtering killed everything, widen.
    if (candidates.length === 0) {
      for (const t of pool.values()) {
        if (usedIds.has(t.id)) continue;
        candidates.push(t);
      }
    }
    if (candidates.length === 0) continue;

    candidates.sort((a, b) => {
      const aDelta = Math.abs((a.bpm ?? targetBpm) - targetBpm);
      const bDelta = Math.abs((b.bpm ?? targetBpm) - targetBpm);
      if (aDelta !== bDelta) return aDelta - bDelta;
      if (prevNeighbor) {
        const qA = rankTransition(
          transitionQuality(prevNeighbor.camelot, a.camelot)
        );
        const qB = rankTransition(
          transitionQuality(prevNeighbor.camelot, b.camelot)
        );
        if (qA !== qB) return qA - qB;
      }
      if (nextNeighbor) {
        const qA = rankTransition(
          transitionQuality(a.camelot, nextNeighbor.camelot)
        );
        const qB = rankTransition(
          transitionQuality(b.camelot, nextNeighbor.camelot)
        );
        if (qA !== qB) return qA - qB;
      }
      return 0;
    });

    const chosen = candidates[0];
    usedIds.add(chosen.id);
    working[i] = chosen;

    const transition = prevNeighbor
      ? describeTransition(
          prevNeighbor.camelot,
          chosen.camelot,
          prevNeighbor.bpm,
          chosen.bpm
        )
      : "opener";

    replacements.push({
      old_id: original.id,
      new_track: chosen,
      why: trimmed
        ? "matches reroll brief + neighbor flow"
        : "matches playlist vibe + neighbor flow",
      transition_note: transition,
    });
  }

  emit({ type: "compose_done", picks: replacements.length });

  return { replacements, pool_size: pool.size, brief };
}
