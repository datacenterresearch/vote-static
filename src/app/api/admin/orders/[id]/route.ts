import { OrderStatus, ProofStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import {
  revertOrderSettlementInTransaction,
  settleOrderInTransaction,
} from "@/lib/settlement";
import { deleteUploadedFile } from "@/lib/storage";

export const dynamic = "force-dynamic";

class AdminOrderActionError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string
  ) {
    super(message);
    this.name = "AdminOrderActionError";
  }
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { error: "Payload JSON tidak valid." },
      { status: 400 }
    );
  }

  const action = typeof body.action === "string" ? body.action : "";
  const note =
    typeof body.note === "string" && body.note.trim()
      ? body.note.trim().slice(0, 300)
      : null;

  if (action !== "COMPLETE" && action !== "CANCEL") {
    return NextResponse.json(
      { error: "Aksi order harus COMPLETE atau CANCEL." },
      { status: 400 }
    );
  }

  try {
    if (action === "COMPLETE") {
      const settlement = await prisma.$transaction(async (tx) => {
        const existing = await tx.voteOrder.findUnique({
          where: { id },
          select: {
            id: true,
            status: true,
            totalAmount: true,
            voteQty: true,
            candidateId: true,
            eventId: true,
          },
        });

        if (!existing) {
          throw new AdminOrderActionError(404, "Order tidak ditemukan.");
        }
        if (existing.status === OrderStatus.PAID) {
          throw new AdminOrderActionError(409, "Order sudah berstatus PAID.");
        }
        if (existing.status === OrderStatus.CANCELLED) {
          throw new AdminOrderActionError(
            409,
            "Order yang sudah dibatalkan tidak dapat diselesaikan."
          );
        }

        const result = await settleOrderInTransaction(tx, existing.id, {
          allowLateOrExpired: true,
        });

        if (!result.settled) {
          throw new AdminOrderActionError(
            409,
            `Order gagal diselesaikan: ${result.reason ?? "unknown"}`
          );
        }

        await tx.manualProof.updateMany({
          where: {
            orderId: existing.id,
            status: ProofStatus.PENDING_REVIEW,
          },
          data: {
            status: ProofStatus.APPROVED,
            reviewedBy: "admin",
            reviewNote:
              note ?? "Disetujui saat penyelesaian pembayaran oleh admin",
          },
        });

        await tx.auditLog.create({
          data: {
            actor: "admin",
            action: "ADMIN_COMPLETE_ORDER",
            targetId: existing.id,
            metadata: {
              previousStatus: existing.status,
              totalAmount: existing.totalAmount,
              voteQty: existing.voteQty,
              candidateId: existing.candidateId,
              note,
            },
          },
        });

        return result;
      });

      return NextResponse.json({
        ok: true,
        status: OrderStatus.PAID,
        settlement,
      });
    }

    const cancelResult = await prisma.$transaction(async (tx) => {
      const existing = await tx.voteOrder.findUnique({
        where: { id },
        select: {
          id: true,
          status: true,
          totalAmount: true,
          voteQty: true,
          candidateId: true,
          eventId: true,
        },
      });

      if (!existing) {
        throw new AdminOrderActionError(404, "Order tidak ditemukan.");
      }
      if (existing.status === OrderStatus.CANCELLED) {
        throw new AdminOrderActionError(
          409,
          "Order sudah berstatus CANCELLED."
        );
      }

      const updated = await tx.voteOrder.updateMany({
        where: {
          id: existing.id,
          status: existing.status,
        },
        data: {
          status: OrderStatus.CANCELLED,
          paidAt: null,
        },
      });

      if (updated.count === 0) {
        throw new AdminOrderActionError(
          409,
          "Status order berubah bersamaan. Silakan muat ulang."
        );
      }

      const revert = await revertOrderSettlementInTransaction(tx, existing.id);

      await tx.manualProof.updateMany({
        where: {
          orderId: existing.id,
          status: ProofStatus.PENDING_REVIEW,
        },
        data: {
          status: ProofStatus.REJECTED,
          reviewedBy: "admin",
          reviewNote: note ?? "Order dibatalkan oleh admin",
        },
      });

      await tx.auditLog.create({
        data: {
          actor: "admin",
          action: "ADMIN_CANCEL_ORDER",
          targetId: existing.id,
          metadata: {
            previousStatus: existing.status,
            totalAmount: existing.totalAmount,
            voteQty: existing.voteQty,
            revertedVotes: revert.revertedVotes,
            unlinkedMutations: revert.unlinkedMutations,
            note,
          },
        },
      });

      return revert;
    });

    return NextResponse.json({
      ok: true,
      status: OrderStatus.CANCELLED,
      revertedVotes: cancelResult.revertedVotes,
      unlinkedMutations: cancelResult.unlinkedMutations,
    });
  } catch (err) {
    if (err instanceof AdminOrderActionError) {
      return NextResponse.json(
        { error: err.message },
        { status: err.statusCode }
      );
    }
    console.error("PATCH /api/admin/orders/[id] error:", err);
    return NextResponse.json(
      { error: "Gagal memproses pembaruan status order." },
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

  try {
    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.voteOrder.findUnique({
        where: { id },
        include: {
          proofs: { select: { imagePath: true } },
          event: { select: { title: true } },
          candidate: { select: { number: true, name: true } },
        },
      });

      if (!existing) {
        throw new AdminOrderActionError(404, "Order tidak ditemukan.");
      }

      const revert = await revertOrderSettlementInTransaction(tx, existing.id);

      await tx.voteOrder.delete({
        where: { id: existing.id },
      });

      await tx.auditLog.create({
        data: {
          actor: "admin",
          action: "ADMIN_DELETE_ORDER",
          targetId: existing.id,
          metadata: {
            previousStatus: existing.status,
            voterName: existing.voterName,
            eventTitle: existing.event.title,
            candidateNumber: existing.candidate.number,
            candidateName: existing.candidate.name,
            voteQty: existing.voteQty,
            totalAmount: existing.totalAmount,
            revertedVotes: revert.revertedVotes,
            unlinkedMutations: revert.unlinkedMutations,
            proofsDeletedCount: existing.proofs.length,
          },
        },
      });

      return {
        proofPaths: existing.proofs.map((p) => p.imagePath),
        revertedVotes: revert.revertedVotes,
        unlinkedMutations: revert.unlinkedMutations,
      };
    });

    await Promise.allSettled(
      result.proofPaths.map((p) => deleteUploadedFile(p))
    );

    return NextResponse.json({
      ok: true,
      deletedId: id,
      revertedVotes: result.revertedVotes,
      unlinkedMutations: result.unlinkedMutations,
    });
  } catch (err) {
    if (err instanceof AdminOrderActionError) {
      return NextResponse.json(
        { error: err.message },
        { status: err.statusCode }
      );
    }
    console.error("DELETE /api/admin/orders/[id] error:", err);
    return NextResponse.json(
      { error: "Gagal menghapus order." },
      { status: 500 }
    );
  }
}
