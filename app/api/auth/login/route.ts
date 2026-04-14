import { NextResponse } from "next/server";
import { z } from "zod";
import { loginBeatport, getMyAccount } from "@/lib/beatport";

export const dynamic = "force-dynamic";

const LoginSchema = z.object({
  username: z.string().min(1).max(200),
  password: z.string().min(1).max(500),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const parsed = LoginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Username and password required" },
      { status: 400 }
    );
  }

  try {
    await loginBeatport(parsed.data.username, parsed.data.password);
    const account = await getMyAccount();
    return NextResponse.json({
      ok: true,
      username: account.username,
      email: account.email,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 401 });
  }
}
