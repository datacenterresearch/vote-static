import { NextRequest, NextResponse } from "next/server";
import { processIncomingMutation } from "@/lib/settlement";
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

  const amount =
    typeof body.amount === "number"
      ? body.amount
      : Number.parseInt(String(body.amount ?? ""), 10);
  const rrn = typeof body.rrn === "string" ? body.rrn.trim() : "";
  const rawMessage =
    typeof body.rawMessage === "string" ? body.rawMessage : undefined;
  const source =
    typeof body.source === "string" && body.source.trim()
      ? body.source.trim().slice(0, 64)
      : "WEBHOOK";
  const eventId =
    typeof body.eventId === "string" && body.eventId.trim()
      ? body.eventId.trim()
      : undefined;
  const transactionAtRaw =
    typeof body.transactionAt === "string" ? body.transactionAt : undefined;
  const transactionAt = transactionAtRaw
    ? new Date(transactionAtRaw)
    : new Date();

  if (!Number.isInteger(amount) || amount <= 0 || !rrn) {
    return NextResponse.json(
      { error: "Fields 'amount' (positive integer) and 'rrn' are required" },
      { status: 400 }
    );
  }

  if (Number.isNaN(transactionAt.getTime())) {
    return NextResponse.json(
      { error: "Invalid 'transactionAt' timestamp" },
      { status: 400 }
    );
  }

  const result = await processIncomingMutation({
    amount,
    rrn: rrn.slice(0, 128),
    rawMessage,
    source,
    transactionAt,
    eventId,
  });

  const statusCode = result.status === "DUPLICATE" ? 409 : 200;
  return NextResponse.json(result, { status: statusCode });
}
