import { z } from "zod";
import { editReroll } from "@/lib/compose";
import type { PoolTrack } from "@/lib/compose";

export const dynamic = "force-dynamic";
export const maxDuration = 180;

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

const EditRerollSchema = z.object({
  playlist_tracks: z.array(PoolTrackSchema).min(1).max(500),
  reroll_ids: z.array(z.number().int()).min(1).max(100),
  user_prompt: z.string().max(2000).optional(),
  force_camelot: z.boolean().default(false),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const parsed = EditRerollSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: parsed.error.flatten() }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      try {
        send({ type: "started" });
        const result = await editReroll(
          parsed.data.playlist_tracks as PoolTrack[],
          parsed.data.reroll_ids,
          parsed.data.user_prompt?.trim() || null,
          {
            forceCamelot: parsed.data.force_camelot,
            onProgress: (ev) => send(ev),
          }
        );
        if (result.replacements.length === 0) {
          send({
            type: "error",
            msg: "Reroll returned no picks. Try a different prompt.",
          });
          return;
        }
        send({
          type: "done",
          result: {
            replacements: result.replacements,
            pool_size: result.pool_size,
            brief: result.brief,
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
