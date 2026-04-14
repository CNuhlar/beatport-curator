import { NextResponse } from "next/server";
import { deletePlaylist, getPlaylistTracks } from "@/lib/beatport";
import { mapTrack } from "@/lib/sync";

export const dynamic = "force-dynamic";

// Return playlist tracks mapped into the same shape the library/edit
// pages consume, plus ordering position.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: idStr } = await params;
  const id = Number(idStr);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }
  try {
    const entries = await getPlaylistTracks(id);
    const tracks = entries.map((e) => ({
      ...mapTrack(e.track),
      _position: e.position,
    }));
    return NextResponse.json({ tracks });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

// Delete an entire playlist on Beatport (called from the edit-page
// sidebar trash icon).
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: idStr } = await params;
  const id = Number(idStr);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }
  try {
    await deletePlaylist(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
