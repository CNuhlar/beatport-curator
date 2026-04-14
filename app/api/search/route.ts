import { NextResponse } from "next/server";
import { searchTracks } from "@/lib/beatport";
import { mapTrack } from "@/lib/sync";

export const dynamic = "force-dynamic";

// Live Beatport catalog search. Returns up to per_page tracks mapped into
// the same shape as /api/tracks (Track-like) so the library grid can
// consume them without changes.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim();
  if (!q || q.length < 2) {
    return NextResponse.json({ tracks: [], count: 0 });
  }
  const page = Number(url.searchParams.get("page") ?? 1);
  const perPage = Math.min(Number(url.searchParams.get("per_page") ?? 50), 100);

  try {
    const { tracks: bp, count } = await searchTracks(q, page, perPage);
    const tracks = bp.map((bt) => ({
      ...mapTrack(bt),
      _position: bt.id, // not really used, but matches shape
    }));
    return NextResponse.json({ tracks, count });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 }
    );
  }
}
