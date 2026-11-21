import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import {
  createVoteOrderWithUniqueCode,
  OrderAllocationError,
} from "@/lib/unique-code";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const ip = getClientIp(req.headers);
  const rate = checkRateLimit(`create-order:${ip}`, 20, 60_000);
  if (!rate.allowed) {
    return NextResponse.json(
      {
        error: `Terlalu banyak permintaan. Coba lagi dalam ${rate.retryAfterSeconds} detik.`,
      },
      {
        status: 429,
        headers: { "Retry-After": String(rate.retryAfterSeconds) },
      }
    );
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

  const eventId = typeof body.eventId === "string" ? body.eventId.trim() : "";
  const candidateId =
    typeof body.candidateId === "string" ? body.candidateId.trim() : "";
  const voterName =
    typeof body.voterName === "string" ? body.voterName.trim() : "";
  const voterContact =
    typeof body.voterContact === "string" ? body.voterContact.trim() : "";
  const sessionKey =
    typeof body.sessionKey === "string" ? body.sessionKey.trim() : "";
  const voteQty =
    typeof body.voteQty === "number"
      ? body.voteQty
      : Number.parseInt(String(body.voteQty ?? ""), 10);

  if (
    !eventId ||
    !candidateId ||
    voterName.length < 2 ||
    voterContact.length < 4 ||
    sessionKey.length < 8
  ) {
    return NextResponse.json(
      {
        error:
          "Data pemilih tidak lengkap (nama min 2 karakter, kontak min 4 karakter).",
      },
      { status: 400 }
    );
  }

  if (!Number.isInteger(voteQty) || voteQty < 1 || voteQty > 1000) {
    return NextResponse.json(
      { error: "Jumlah vote harus bilangan bulat antara 1 hingga 1000." },
      { status: 400 }
    );
  }

  try {
    const result = await createVoteOrderWithUniqueCode({
      eventId,
      candidateId,
      voterName: voterName.slice(0, 120),
      voterContact: voterContact.slice(0, 120),
      sessionKey: sessionKey.slice(0, 120),
      voteQty,
    });

    return NextResponse.json(
      {
        order: {
          id: result.order.id,
          eventId: result.order.eventId,
          candidateId: result.order.candidateId,
          voteQty: result.order.voteQty,
          baseAmount: result.order.baseAmount,
          uniqueCode: result.order.uniqueCode,
          totalAmount: result.order.totalAmount,
          status: result.order.status,
          expiresAt: result.order.expiresAt.toISOString(),
        },
        reused: result.reused,
      },
      { status: result.reused ? 200 : 201 }
    );
  } catch (err) {
    if (err instanceof OrderAllocationError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: err.statusCode }
      );
    }
    console.error("POST /api/orders error:", err);
    return NextResponse.json(
      { error: "Terjadi kesalahan internal saat membuat order." },
      { status: 500 }
    );
  }
}
