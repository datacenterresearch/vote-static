import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import { validateQrisPayload } from "@/lib/qris";
import { saveUploadedImage } from "@/lib/storage";
import { MIN_PRICE_PER_VOTE } from "@/lib/unique-code";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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

  const title = String(formData.get("title") ?? "").trim();
  const slug = String(formData.get("slug") ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-|-$/g, "");
  const description = String(formData.get("description") ?? "").trim() || null;
  const pricePerVote = Number.parseInt(
    String(formData.get("pricePerVote") ?? "0"),
    10
  );
  const orderCutoffMinutes = Number.parseInt(
    String(formData.get("orderCutoffMinutes") ?? "15"),
    10
  );
  const startsAtRaw = String(formData.get("startsAt") ?? "").trim();
  const endsAtRaw = String(formData.get("endsAt") ?? "").trim();
  const qrisRawPayload =
    String(formData.get("qrisRawPayload") ?? "").trim() || null;
  const isBlindMode = String(formData.get("isBlindMode") ?? "false") === "true";
  const isActive = String(formData.get("isActive") ?? "true") !== "false";
  const qrisImage = formData.get("qrisImage");

  if (!title || !slug) {
    return NextResponse.json(
      { error: "Judul dan slug event wajib diisi." },
      { status: 400 }
    );
  }

  if (!Number.isInteger(pricePerVote) || pricePerVote < MIN_PRICE_PER_VOTE) {
    return NextResponse.json(
      { error: `Harga per vote minimal Rp${MIN_PRICE_PER_VOTE}.` },
      { status: 400 }
    );
  }

  if (!Number.isInteger(orderCutoffMinutes) || orderCutoffMinutes < 0) {
    return NextResponse.json(
      { error: "Order cutoff minutes tidak valid." },
      { status: 400 }
    );
  }

  const startsAt = new Date(startsAtRaw);
  const endsAt = new Date(endsAtRaw);
  if (
    Number.isNaN(startsAt.getTime()) ||
    Number.isNaN(endsAt.getTime()) ||
    endsAt <= startsAt
  ) {
    return NextResponse.json(
      { error: "Rentang waktu mulai dan berakhir tidak valid." },
      { status: 400 }
    );
  }

  if (qrisRawPayload) {
    const check = validateQrisPayload(qrisRawPayload);
    if (!check.valid) {
      return NextResponse.json(
        { error: `Payload QRIS statis tidak valid: ${check.reason}` },
        { status: 400 }
      );
    }
  }

  let qrisImagePath: string | null = null;
  if (qrisImage instanceof File && qrisImage.size > 0) {
    try {
      const saved = await saveUploadedImage("qris", qrisImage);
      qrisImagePath = saved.relativePath;
    } catch (err) {
      return NextResponse.json(
        {
          error:
            err instanceof Error
              ? err.message
              : "Gagal mengunggah gambar QRIS.",
        },
        { status: 400 }
      );
    }
  }

  try {
    const event = await prisma.$transaction(async (tx) => {
      const created = await tx.event.create({
        data: {
          slug,
          title,
          description,
          pricePerVote,
          qrisImagePath,
          qrisRawPayload,
          startsAt,
          endsAt,
          orderCutoffMinutes,
          isBlindMode,
          isActive,
        },
      });

      await tx.auditLog.create({
        data: {
          actor: "admin",
          action: "CREATE_EVENT",
          targetId: created.id,
          metadata: { slug: created.slug, pricePerVote: created.pricePerVote },
        },
      });

      return created;
    });

    return NextResponse.json({ event }, { status: 201 });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      return NextResponse.json(
        { error: `Slug '${slug}' sudah digunakan.` },
        { status: 409 }
      );
    }
    console.error("POST /api/admin/events error:", err);
    return NextResponse.json(
      { error: "Gagal membuat event." },
      { status: 500 }
    );
  }
}
