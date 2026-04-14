import { NextResponse } from "next/server";
import { listMyPlaylists } from "@/lib/beatport";

export const dynamic = "force-dynamic";

// List the user's Beatport playlists (live, not cached from DB).
export async function GET() {
  try {
    const playlists = await listMyPlaylists();
    return NextResponse.json({ playlists });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
