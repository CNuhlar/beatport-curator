import { NextResponse } from "next/server";
import { z } from "zod";
import { syncPlaylistContents } from "@/lib/beatport";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Client calls this after any in-place mutation of a built set (reroll,
// replace, delete, reorder). It just forwards the new track order to
// Beatport via the delete+recreate helper. No local persistence.
const SyncSchema = z.object({
  beatport_id: z.number().int().nullable(),
  name: z.string().min(1).max(200),
  track_ids: z.array(z.number().int()).min(1).max(500),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const parsed = SyncSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const syncedId = await syncPlaylistContents(
      parsed.data.beatport_id,
      parsed.data.name,
      parsed.data.track_ids
    );
    return NextResponse.json({ ok: true, beatport_id: syncedId });
  } catch (e) {
    return NextResponse.json(
      { ok: false, beatport_id: null, error: (e as Error).message },
      { status: 500 }
    );
  }
}
