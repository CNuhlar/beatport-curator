import { z } from "zod";
import { rerollSection } from "@/lib/compose";
import type { PoolTrack } from "@/lib/compose";

export const dynamic = "force-dynamic";
export const maxDuration = 180;

const SectionSchema = z.object({
  duration_min: z.number().int().min(3).max(240),
  prompt: z.string().min(3).max(2000),
});

const PoolTrackSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  mix_name: z.string().nullable(),
  artists: z.array(z.string()),
  label: z.string().nullable(),
  genre: z.string().nullable(),
  bpm: z.number().nullable(),
  key_name: z.string().nullable(),
  camelot: z.string().nullable(),
  length_ms: z.number().nullable(),
  image_url: z.string().nullable(),
  slug: z.string().nullable(),
  sample_url: z.string().nullable(),
  sample_start_ms: z.number().nullable(),
  sample_end_ms: z.number().nullable(),
});

const RerollSchema = z.object({
  sections: z.array(SectionSchema).min(1).max(8),
  reroll_index: z.number().int().min(0).max(7),
  // current_picks: per-section list of picked tracks (for locked context)
  current_picks: z.record(z.string(), z.array(PoolTrackSchema)),
  // exclude_ids: ids of the current target-section picks to avoid re-picking
  exclude_ids: z.array(z.number().int()).default([]),
  force_camelot: z.boolean().default(false),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const parsed = RerollSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({ error: parsed.error.flatten() }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  // Convert {[idx]: PoolTrack[]} from JSON keys (strings) → numeric record
  const lockedPicks: Record<number, PoolTrack[]> = {};
  for (const [k, v] of Object.entries(parsed.data.current_picks)) {
    lockedPicks[Number(k)] = v as PoolTrack[];
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));

      try {
        send({ type: "started" });
        const result = await rerollSection(
          parsed.data.sections,
          lockedPicks,
          parsed.data.reroll_index,
          parsed.data.exclude_ids,
          {
            onProgress: (ev) => send(ev),
            forceCamelot: parsed.data.force_camelot,
          }
        );

        if (result.tracks.length === 0) {
          send({
            type: "error",
            msg: "Re-roll returned no picks. Try fewer exclusions or a different brief.",
          });
          return;
        }

        send({
          type: "done",
          result: {
            section_index: result.section_index,
            phase: result.phase,
            tracks: result.tracks,
            pool_size: result.pool_size,
          },
        });
      } catch (e) {
        send({ type: "error", msg: (e as Error).message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
