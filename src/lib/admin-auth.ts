import crypto from "node:crypto";
import { cookies } from "next/headers";

export const ADMIN_COOKIE_NAME = "vote_admin_session";
const SESSION_TTL_SECONDS = 60 * 60 * 12; // 12 hours

function getAuthSecret(): string {
  return process.env.AUTH_SECRET || process.env.ADMIN_PASSWORD || "";
}

function sha256Buffer(value: string): Buffer {
  return crypto.createHash("sha256").update(value, "utf8").digest();
}

export function verifyAdminPassword(candidatePassword: string): boolean {
  const configured = process.env.ADMIN_PASSWORD;
  if (!configured || !candidatePassword) {
    return false;
  }
  return crypto.timingSafeEqual(
    sha256Buffer(candidatePassword),
    sha256Buffer(configured)
  );
}

export function createAdminSessionToken(nowMs: number = Date.now()): string {
  const secret = getAuthSecret();
  if (!secret) {
    throw new Error("AUTH_SECRET or ADMIN_PASSWORD must be configured");
  }
  const exp = Math.floor(nowMs / 1000) + SESSION_TTL_SECONDS;
  const payload = `admin.${exp}`;
  const sig = crypto
    .createHmac("sha256", secret)
    .update(payload, "utf8")
    .digest("hex");
  return `${payload}.${sig}`;
}

export function verifyAdminSessionToken(
  token: string | undefined | null,
  nowMs: number = Date.now()
): boolean {
  const secret = getAuthSecret();
  if (!secret || !token) {
    return false;
  }

  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== "admin") {
    return false;
  }

  const exp = Number.parseInt(parts[1], 10);
  if (!Number.isFinite(exp) || exp <= Math.floor(nowMs / 1000)) {
    return false;
  }

  const payload = `${parts[0]}.${parts[1]}`;
  const expectedSig = crypto
    .createHmac("sha256", secret)
    .update(payload, "utf8")
    .digest("hex");

  const providedBuf = Buffer.from(parts[2], "utf8");
  const expectedBuf = Buffer.from(expectedSig, "utf8");
  if (providedBuf.length !== expectedBuf.length) {
    return false;
  }

  return crypto.timingSafeEqual(providedBuf, expectedBuf);
}

export async function isAdminAuthenticated(): Promise<boolean> {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_COOKIE_NAME)?.value;
  return verifyAdminSessionToken(token);
}

export function getAdminCookieOptions() {
  return {
    name: ADMIN_COOKIE_NAME,
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  };
}
