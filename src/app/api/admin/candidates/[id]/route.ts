import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import { deleteUploadedFile } from "@/lib/storage";

export const dynamic = "force-dynamic";

export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const candidate = await prisma.candidate.findUnique({
    where: { id },
    include: {
      _count: { select: { ledgers: true } },
    },
  });

  if (!candidate) {
    return NextResponse.json(
      { error: "Kandidat tidak ditemukan." },
      { status: 404 }
    );
  }

  if (candidate._count.ledgers > 0) {
    return NextResponse.json(
      {
        error:
          "Kandidat sudah memiliki suara sah di VoteLedger dan tidak boleh dihapus.",
      },
      { status: 409 }
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.candidate.delete({ where: { id } });
    await tx.auditLog.create({
      data: {
        actor: "admin",
        action: "DELETE_CANDIDATE",
        targetId: id,
        metadata: { name: candidate.name, eventId: candidate.eventId },
      },
    });
  });

  await deleteUploadedFile(candidate.photoPath);

  return NextResponse.json({ ok: true });
}
