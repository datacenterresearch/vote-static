import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import { deleteUploadedFile, saveUploadedImage } from "@/lib/storage";

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

  const eventId = String(formData.get("eventId") ?? "").trim();
  const number = Number.parseInt(String(formData.get("number") ?? "0"), 10);
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const photo = formData.get("photo");

  if (!eventId || !name || !Number.isInteger(number) || number <= 0) {
    return NextResponse.json(
      { error: "Event, nomor urut (>0), dan nama kandidat wajib diisi." },
      { status: 400 }
    );
  }

  let photoPath: string | null = null;
  if (photo instanceof File && photo.size > 0) {
    try {
      const saved = await saveUploadedImage("candidates", photo);
      photoPath = saved.relativePath;
    } catch (err) {
      return NextResponse.json(
        {
          error:
            err instanceof Error
              ? err.message
              : "Gagal mengunggah foto kandidat.",
        },
        { status: 400 }
      );
    }
  }

  try {
    const candidate = await prisma.$transaction(async (tx) => {
      const created = await tx.candidate.create({
        data: {
          eventId,
          number,
          name,
          description,
          photoPath,
        },
      });

      await tx.auditLog.create({
        data: {
          actor: "admin",
          action: "CREATE_CANDIDATE",
          targetId: created.id,
          metadata: { eventId, number, name },
        },
      });

      return created;
    });

    return NextResponse.json({ candidate }, { status: 201 });
  } catch (err) {
    if (photoPath) {
      await deleteUploadedFile(photoPath);
    }
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      return NextResponse.json(
        { error: `Nomor urut ${number} sudah digunakan di event ini.` },
        { status: 409 }
      );
    }
    console.error("POST /api/admin/candidates error:", err);
    return NextResponse.json(
      { error: "Gagal menambah kandidat." },
      { status: 500 }
    );
  }
}
