import { NextResponse } from "next/server";
import { getChartTracks } from "@/lib/beatport";
import { mapTrack } from "@/lib/sync";

export const dynamic = "force-dynamic";

// Return chart tracks mapped into the same Track-like shape the library grid
// consumes. Chart tracks are flat BeatportTrack objects (not entry-wrapped).
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
    const bpTracks = await getChartTracks(id);
    const tracks = bpTracks.map((bt, i) => ({
      ...mapTrack(bt),
      _position: i + 1,
    }));
    return NextResponse.json({ tracks });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
