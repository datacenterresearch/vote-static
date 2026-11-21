import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { processIncomingMutation } from "@/lib/settlement";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { error: "Payload JSON tidak valid." },
      { status: 400 }
    );
  }

  const amount =
    typeof body.amount === "number"
      ? body.amount
      : Number.parseInt(String(body.amount ?? ""), 10);
  const rrn =
    typeof body.rrn === "string" && body.rrn.trim()
      ? body.rrn.trim().slice(0, 128)
      : `SIM-${Date.now()}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
  const rawMessage =
    typeof body.rawMessage === "string" && body.rawMessage.trim()
      ? body.rawMessage.trim()
      : `Simulated QRIS incoming mutation Rp${amount}`;
  const eventId =
    typeof body.eventId === "string" && body.eventId.trim()
      ? body.eventId.trim()
      : undefined;

  if (!Number.isInteger(amount) || amount <= 0) {
    return NextResponse.json(
      { error: "Nominal mutasi harus bilangan bulat positif." },
      { status: 400 }
    );
  }

  const result = await processIncomingMutation({
    amount,
    rrn,
    rawMessage,
    source: "SIMULATOR",
    transactionAt: new Date(),
    eventId,
  });

  const statusCode = result.status === "DUPLICATE" ? 409 : 200;
  return NextResponse.json({ ...result, rrn }, { status: statusCode });
}
