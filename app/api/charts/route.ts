import { NextResponse } from "next/server";
import { listCharts } from "@/lib/beatport";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const page = Number(url.searchParams.get("page") ?? 1);
  const perPage = Math.min(Number(url.searchParams.get("per_page") ?? 30), 100);
  try {
    const charts = await listCharts(page, perPage);
    return NextResponse.json({ charts });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
