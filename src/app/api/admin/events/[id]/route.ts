import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import { validateQrisPayload } from "@/lib/qris";
import { deleteUploadedFile, saveUploadedImage } from "@/lib/storage";
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
  let uploadedQrisPath: string | null = null;

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
    if (formData.has("slug")) {
      const slug = String(formData.get("slug") ?? "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, "-")
        .replace(/^-|-$/g, "");
      if (!slug) {
        return NextResponse.json(
          { error: "Slug event tidak boleh kosong." },
          { status: 400 }
        );
      }
      data.slug = slug;
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
    if (formData.has("orderCutoffMinutes")) {
      const cutoff = Number.parseInt(
        String(formData.get("orderCutoffMinutes") ?? ""),
        10
      );
      if (!Number.isInteger(cutoff) || cutoff < 0) {
        return NextResponse.json(
          { error: "Cutoff order harus bilangan bulat minimal 0." },
          { status: 400 }
        );
      }
      data.orderCutoffMinutes = cutoff;
    }
    if (formData.has("isBlindMode")) {
      data.isBlindMode = String(formData.get("isBlindMode")) === "true";
    }
    if (formData.has("isActive")) {
      data.isActive = String(formData.get("isActive")) === "true";
    }
    if (formData.has("startsAt")) {
      const startsAt = new Date(String(formData.get("startsAt")));
      if (Number.isNaN(startsAt.getTime())) {
        return NextResponse.json(
          { error: "Tanggal mulai tidak valid." },
          { status: 400 }
        );
      }
      data.startsAt = startsAt;
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
    const effectiveStartsAt =
      data.startsAt instanceof Date ? data.startsAt : existing.startsAt;
    const effectiveEndsAt =
      data.endsAt instanceof Date ? data.endsAt : existing.endsAt;
    if (effectiveEndsAt <= effectiveStartsAt) {
      return NextResponse.json(
        { error: "Tanggal selesai harus lebih besar dari tanggal mulai." },
        { status: 400 }
      );
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
      try {
        const saved = await saveUploadedImage("qris", qrisImage);
        uploadedQrisPath = saved.relativePath;
        data.qrisImagePath = saved.relativePath;
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

  try {
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

    if (
      uploadedQrisPath &&
      existing.qrisImagePath &&
      existing.qrisImagePath !== uploadedQrisPath
    ) {
      await deleteUploadedFile(existing.qrisImagePath);
    }

    return NextResponse.json({ event: updated });
  } catch (err) {
    if (uploadedQrisPath) {
      await deleteUploadedFile(uploadedQrisPath);
    }
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      return NextResponse.json(
        { error: "Slug sudah digunakan." },
        { status: 409 }
      );
    }
    console.error("PATCH /api/admin/events/[id] error:", err);
    return NextResponse.json(
      { error: "Gagal memperbarui pengaturan event." },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const existing = await prisma.event.findUnique({
    where: { id },
    include: {
      candidates: { select: { photoPath: true, totalVotes: true } },
      orders: { select: { proofs: { select: { imagePath: true } } } },
      _count: { select: { candidates: true, orders: true } },
    },
  });

  if (!existing) {
    return NextResponse.json(
      { error: "Event tidak ditemukan." },
      { status: 404 }
    );
  }

  const totalVotes = existing.candidates.reduce(
    (sum, c) => sum + c.totalVotes,
    0
  );

  try {
    await prisma.$transaction(async (tx) => {
      await tx.event.delete({ where: { id } });

      await tx.auditLog.create({
        data: {
          actor: "admin",
          action: "DELETE_EVENT",
          targetId: id,
          metadata: {
            title: existing.title,
            slug: existing.slug,
            candidatesCount: existing._count.candidates,
            ordersCount: existing._count.orders,
            totalVotes,
          },
        },
      });
    });

    const paths: Array<string | null | undefined> = [
      existing.qrisImagePath,
      ...existing.candidates.map((c) => c.photoPath),
      ...existing.orders.flatMap((o) => o.proofs.map((p) => p.imagePath)),
    ];
    await Promise.allSettled(paths.map((p) => deleteUploadedFile(p)));

    return NextResponse.json({ ok: true, deletedId: id });
  } catch (err) {
    console.error("DELETE /api/admin/events/[id] error:", err);
    return NextResponse.json(
      { error: "Gagal menghapus event." },
      { status: 500 }
    );
  }
}
