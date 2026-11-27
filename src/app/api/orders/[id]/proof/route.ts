import { OrderStatus, Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { deleteUploadedFile, saveUploadedImage } from "@/lib/storage";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const ip = getClientIp(req.headers);
  const rate = checkRateLimit(`upload-proof:${ip}`, 10, 60_000);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Terlalu banyak unggahan bukti. Coba lagi sebentar." },
      { status: 429 }
    );
  }

  const { id } = await context.params;
  const order = await prisma.voteOrder.findUnique({
    where: { id },
    select: { id: true, status: true },
  });

  if (!order) {
    return NextResponse.json(
      { error: "Order tidak ditemukan." },
      { status: 404 }
    );
  }

  if (
    order.status === OrderStatus.PAID ||
    order.status === OrderStatus.CANCELLED
  ) {
    return NextResponse.json(
      { error: `Order sudah berstatus ${order.status}.` },
      { status: 400 }
    );
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "Request harus berupa multipart/form-data." },
      { status: 400 }
    );
  }

  const file = formData.get("file");
  const rrnInputRaw = formData.get("rrnInput");
  const rrnInput =
    typeof rrnInputRaw === "string" && rrnInputRaw.trim()
      ? rrnInputRaw.trim().slice(0, 80)
      : null;

  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "File gambar bukti pembayaran wajib diunggah." },
      { status: 400 }
    );
  }

  let saved: { relativePath: string; imageHash: string };
  try {
    saved = await saveUploadedImage("proofs", file);
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Gagal menyimpan gambar bukti.",
      },
      { status: 400 }
    );
  }

  try {
    const proof = await prisma.$transaction(async (tx) => {
      const created = await tx.manualProof.create({
        data: {
          orderId: order.id,
          imagePath: saved.relativePath,
          imageHash: saved.imageHash,
          rrnInput,
        },
      });

      await tx.auditLog.create({
        data: {
          actor: "voter",
          action: "UPLOAD_MANUAL_PROOF",
          targetId: order.id,
          metadata: {
            proofId: created.id,
            imageHash: saved.imageHash,
            rrnInput,
          },
        },
      });

      return created;
    });

    return NextResponse.json(
      {
        proof: {
          id: proof.id,
          status: proof.status,
          rrnInput: proof.rrnInput,
          imageUrl: `/api/files/${proof.imagePath}`,
          createdAt: proof.createdAt.toISOString(),
        },
      },
      { status: 201 }
    );
  } catch (err) {
    await deleteUploadedFile(saved.relativePath);
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      return NextResponse.json(
        {
          error:
            "Gambar bukti pembayaran ini sudah pernah digunakan pada transaksi lain (duplikat terdeteksi).",
        },
        { status: 409 }
      );
    }
    console.error("POST /api/orders/[id]/proof error:", err);
    return NextResponse.json(
      { error: "Gagal menyimpan bukti pembayaran." },
      { status: 500 }
    );
  }
}
