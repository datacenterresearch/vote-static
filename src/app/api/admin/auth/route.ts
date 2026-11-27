import { NextRequest, NextResponse } from "next/server";
import {
  ADMIN_COOKIE_NAME,
  createAdminSessionToken,
  getAdminCookieOptions,
  isAdminAuthenticated,
  verifyAdminPassword,
} from "@/lib/admin-auth";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function GET() {
  const authenticated = await isAdminAuthenticated();
  return NextResponse.json({ authenticated });
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req.headers);
  const rate = checkRateLimit(`admin-login:${ip}`, 10, 60_000);
  if (!rate.allowed) {
    return NextResponse.json(
      {
        error: `Terlalu banyak percobaan login. Coba lagi dalam ${rate.retryAfterSeconds} detik.`,
      },
      { status: 429 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Payload tidak valid" }, { status: 400 });
  }

  const password = typeof body.password === "string" ? body.password : "";
  if (!process.env.ADMIN_PASSWORD) {
    return NextResponse.json(
      { error: "ADMIN_PASSWORD belum dikonfigurasi pada server." },
      { status: 500 }
    );
  }

  if (!verifyAdminPassword(password)) {
    return NextResponse.json(
      { error: "Password admin salah." },
      { status: 401 }
    );
  }

  const token = createAdminSessionToken();
  const res = NextResponse.json({ ok: true });
  res.cookies.set({
    ...getAdminCookieOptions(),
    value: token,
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(ADMIN_COOKIE_NAME);
  return res;
}
