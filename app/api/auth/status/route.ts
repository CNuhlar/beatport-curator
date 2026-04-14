import { NextResponse } from "next/server";
import { getMyAccount, isAuthenticated } from "@/lib/beatport";

export const dynamic = "force-dynamic";

export async function GET() {
  const ok = await isAuthenticated();
  if (!ok) {
    return NextResponse.json({ authenticated: false });
  }
  try {
    const account = await getMyAccount();
    return NextResponse.json({
      authenticated: true,
      username: account.username,
      email: account.email,
    });
  } catch {
    return NextResponse.json({ authenticated: false });
  }
}
