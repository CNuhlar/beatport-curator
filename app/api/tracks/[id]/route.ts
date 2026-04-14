import { NextResponse } from "next/server";
import { getTrack } from "@/lib/beatport";

export const dynamic = "force-dynamic";

// GET fresh track detail from Beatport — we pass through the raw response
// so the preview panel can show every field the API provides.
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
    const track = await getTrack(id);
    return NextResponse.json(track);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
