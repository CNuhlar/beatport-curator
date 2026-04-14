import { NextResponse } from "next/server";
import { clearToken } from "@/lib/beatport";

export const dynamic = "force-dynamic";

export async function POST() {
  await clearToken();
  return NextResponse.json({ ok: true });
}
