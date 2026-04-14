import { NextResponse } from "next/server";
import { z } from "zod";
import { syncPlaylistContents } from "@/lib/beatport";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Save an edited Beatport playlist — the user picked a playlist from the
// /edit page, rerolled some tracks, now wants to push the new order back
// to Beatport. We always try to update in place (clear + re-add); on
// failure, syncPlaylistContents falls back to delete + recreate.
const SaveSchema = z.object({
  beatport_id: z.number().int(),
  name: z.string().min(1).max(200),
  track_ids: z.array(z.number().int()).min(1).max(500),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const parsed = SaveSchema.safeParse(body);
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
      { ok: false, error: (e as Error).message },
      { status: 500 }
    );
  }
}
