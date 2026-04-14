import { NextResponse } from "next/server";
import { z } from "zod";
import { extractStrategy } from "@/lib/claude";
import { searchTracks } from "@/lib/beatport";
import { toCamelot } from "@/lib/camelot";
import type { PoolTrack } from "@/lib/compose";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SectionSchema = z.object({
  duration_min: z.number().int().min(3).max(240),
  prompt: z.string().min(3).max(2000),
});

const ReplaceSchema = z.object({
  // Just the section we're replacing within (mini-strategy)
  section: SectionSchema,
  // IDs to exclude (the current pick + already-used in other sections)
  exclude_ids: z.array(z.number().int()).default([]),
  // Optional: how many alternatives to return
  limit: z.number().int().min(1).max(20).default(8),
});

function flatten(bt: any): PoolTrack {
  const cam =
    bt.key?.camelot_number && bt.key?.camelot_letter
      ? `${bt.key.camelot_number}${bt.key.camelot_letter}`
      : toCamelot(bt.key?.name);
  return {
    id: bt.id,
    name: bt.name,
    mix_name: bt.mix_name ?? null,
    artists: (bt.artists ?? []).map((a: any) => a.name),
    label: bt.release?.label?.name ?? null,
    genre: bt.sub_genre?.name ?? bt.genre?.name ?? null,
    bpm: bt.bpm ?? null,
    key_name: bt.key?.name ?? null,
    camelot: cam,
    length_ms: bt.length_ms ?? null,
    image_url: bt.release?.image?.uri ?? bt.image?.uri ?? null,
    slug: bt.slug ?? null,
    sample_url: bt.sample_url ?? null,
    sample_start_ms: bt.sample_start_ms ?? null,
    sample_end_ms: bt.sample_end_ms ?? null,
  };
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const parsed = ReplaceSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    // 1. LLM extracts search queries for just this one section
    const strategy = await extractStrategy([parsed.data.section]);
    const phase = strategy.phases[0];
    if (!phase) throw new Error("No strategy returned");

    // 2. Run searches in parallel, dedupe pool
    const pool = new Map<number, PoolTrack>();
    const uniqueQueries = Array.from(
      new Set(phase.search_queries.map((q) => q.trim().toLowerCase()))
    );
    await Promise.all(
      uniqueQueries.map(async (q) => {
        try {
          const { tracks } = await searchTracks(q, 1, 25);
          for (const t of tracks) {
            if (!pool.has(t.id)) pool.set(t.id, flatten(t));
          }
        } catch {
          /* ignore single-query failures */
        }
      })
    );

    // 3. Filter: BPM in range, not excluded
    const lo = phase.bpm_min - 4;
    const hi = phase.bpm_max + 4;
    const candidates = Array.from(pool.values())
      .filter((t) => !parsed.data.exclude_ids.includes(t.id))
      .filter((t) => t.bpm == null || (t.bpm >= lo && t.bpm <= hi))
      .slice(0, parsed.data.limit);

    return NextResponse.json({
      candidates,
      pool_size: pool.size,
      phase: { name: phase.name, bpm_min: phase.bpm_min, bpm_max: phase.bpm_max },
    });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 }
    );
  }
}
