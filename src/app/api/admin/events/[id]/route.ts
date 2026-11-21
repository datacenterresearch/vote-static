import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import { validateQrisPayload } from "@/lib/qris";
import { saveUploadedImage } from "@/lib/storage";
import { MIN_PRICE_PER_VOTE } from "@/lib/unique-code";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const existing = await prisma.event.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json(
      { error: "Event tidak ditemukan." },
      { status: 404 }
    );
  }

  const contentType = req.headers.get("content-type") ?? "";
  const data: Record<string, unknown> = {};

  if (contentType.includes("multipart/form-data")) {
    const formData = await req.formData();
    if (formData.has("title")) {
      const title = String(formData.get("title") ?? "").trim();
      if (!title) {
        return NextResponse.json(
          { error: "Judul event tidak boleh kosong." },
          { status: 400 }
        );
      }
      data.title = title;
    }
    if (formData.has("description")) {
      data.description =
        String(formData.get("description") ?? "").trim() || null;
    }
    if (formData.has("pricePerVote")) {
      const price = Number.parseInt(
        String(formData.get("pricePerVote") ?? "0"),
        10
      );
      if (!Number.isInteger(price) || price < MIN_PRICE_PER_VOTE) {
        return NextResponse.json(
          { error: `Harga minimal Rp${MIN_PRICE_PER_VOTE}.` },
          { status: 400 }
        );
      }
      data.pricePerVote = price;
    }
    if (formData.has("isBlindMode")) {
      data.isBlindMode = String(formData.get("isBlindMode")) === "true";
    }
    if (formData.has("isActive")) {
      data.isActive = String(formData.get("isActive")) === "true";
    }
    if (formData.has("endsAt")) {
      const endsAt = new Date(String(formData.get("endsAt")));
      if (Number.isNaN(endsAt.getTime())) {
        return NextResponse.json(
          { error: "Tanggal selesai tidak valid." },
          { status: 400 }
        );
      }
      data.endsAt = endsAt;
    }
    if (formData.has("qrisRawPayload")) {
      const payload = String(formData.get("qrisRawPayload") ?? "").trim();
      if (payload) {
        const check = validateQrisPayload(payload);
        if (!check.valid) {
          return NextResponse.json(
            { error: `Payload QRIS tidak valid: ${check.reason}` },
            { status: 400 }
          );
        }
        data.qrisRawPayload = payload;
      } else {
        data.qrisRawPayload = null;
      }
    }
    const qrisImage = formData.get("qrisImage");
    if (qrisImage instanceof File && qrisImage.size > 0) {
      const saved = await saveUploadedImage("qris", qrisImage);
      data.qrisImagePath = saved.relativePath;
    }
  } else {
    let body: Record<string, unknown>;
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json(
        { error: "Payload JSON tidak valid." },
        { status: 400 }
      );
    }

    if (typeof body.isBlindMode === "boolean") {
      data.isBlindMode = body.isBlindMode;
    }
    if (typeof body.isActive === "boolean") {
      data.isActive = body.isActive;
    }
    if (typeof body.title === "string" && body.title.trim()) {
      data.title = body.title.trim();
    }
  }

  const updated = await prisma.$transaction(async (tx) => {
    const event = await tx.event.update({
      where: { id },
      data,
    });

    await tx.auditLog.create({
      data: {
        actor: "admin",
        action: "UPDATE_EVENT",
        targetId: event.id,
        metadata: { updatedFields: Object.keys(data) },
      },
    });

    return event;
  });

  return NextResponse.json({ event: updated });
}
