import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyWebhookRequest } from "@/lib/webhook-security";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-signature");
  const timestamp = req.headers.get("x-timestamp");

  const verification = verifyWebhookRequest({
    secret: process.env.WEBHOOK_SECRET ?? "",
    signature,
    timestamp,
    rawBody,
  });

  if (!verification.valid) {
    return NextResponse.json(
      { error: verification.reason ?? "Unauthorized webhook signature" },
      { status: 401 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const deviceName =
    typeof body.deviceName === "string" && body.deviceName.trim()
      ? body.deviceName.trim().slice(0, 80)
      : "";
  const status =
    typeof body.status === "string" && body.status.trim()
      ? body.status.trim().slice(0, 32)
      : "ONLINE";

  if (!deviceName) {
    return NextResponse.json(
      { error: "Field 'deviceName' is required" },
      { status: 400 }
    );
  }

  const metadata =
    body.metadata && typeof body.metadata === "object"
      ? (body.metadata as Prisma.InputJsonValue)
      : undefined;

  const heartbeat = await prisma.listenerHeartbeat.upsert({
    where: { deviceName },
    update: {
      lastPingAt: new Date(),
      status,
      ...(metadata !== undefined ? { metadata } : {}),
    },
    create: {
      deviceName,
      lastPingAt: new Date(),
      status,
      ...(metadata !== undefined ? { metadata } : {}),
    },
  });

  return NextResponse.json({
    ok: true,
    heartbeat: {
      id: heartbeat.id,
      deviceName: heartbeat.deviceName,
      status: heartbeat.status,
      lastPingAt: heartbeat.lastPingAt.toISOString(),
    },
  });
}
