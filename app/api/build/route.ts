import { NextResponse } from "next/server";
import { z } from "zod";
import { composeOnDemand } from "@/lib/compose";
import { addTracksToPlaylist, createPlaylist } from "@/lib/beatport";

export const dynamic = "force-dynamic";
export const maxDuration = 180;

const SectionSchema = z.object({
  duration_min: z.number().int().min(3).max(240),
  prompt: z.string().min(3).max(2000),
});

const BuildSchema = z.object({
  sections: z.array(SectionSchema).min(1).max(8),
  name: z.string().min(1).max(120).optional(),
  force_camelot: z.boolean().default(false),
});

function defaultName(sections: { duration_min: number; prompt: string }[]): string {
  const head = sections[0].prompt.trim().slice(0, 48).replace(/\s+/g, " ");
  const total = sections.reduce((a, s) => a + s.duration_min, 0);
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  const suffix =
    sections.length > 1 ? ` · ${sections.length}x · ${total}m` : ` · ${total}m`;
  return `${head}${suffix} · ${hh}:${mm}`;
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const parsed = BuildSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));

      try {
        send({ type: "started" });

        const result = await composeOnDemand(parsed.data.sections, {
          onProgress: (ev) => send(ev),
          forceCamelot: parsed.data.force_camelot,
        });

        const allPicks = result.phases.flatMap((p) => p.tracks);
        if (allPicks.length === 0) {
          send({
            type: "error",
            msg: "The model couldn't compose a set from the search results. Try more specific section prompts.",
            strategy: result.strategy,
          });
          return;
        }

        const playlistName =
          parsed.data.name?.trim() || defaultName(parsed.data.sections);

        // ── Push to Beatport ──────────────────────────────────────
        // Beatport is the source of truth — we don't keep a local
        // mirror anymore. The client holds the full result in state
        // and localStorage, and uses the returned beatport_id as the
        // stable handle for subsequent reroll/replace sync calls.
        send({ type: "beatport_pushing" });
        let beatportId: number | null = null;
        let beatportError: string | null = null;
        try {
          const bp = await createPlaylist(playlistName);
          beatportId = bp.id;
          if (bp.id) {
            const trackIds = allPicks.map((p) => p.track.id);
            const chunkSize = 100;
            for (let i = 0; i < trackIds.length; i += chunkSize) {
              await addTracksToPlaylist(bp.id, trackIds.slice(i, i + chunkSize));
            }
          }
        } catch (e) {
          beatportError = (e as Error).message;
        }
        send({
          type: "beatport_done",
          beatport_id: beatportId,
          beatport_error: beatportError,
        });

        // ── Final result ────────────────────────────────────────────
        send({
          type: "done",
          result: {
            strategy: result.strategy,
            phases: result.phases,
            pool_size: result.pool_size,
            playlist_name: playlistName,
            beatport_id: beatportId,
            beatport_error: beatportError,
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
