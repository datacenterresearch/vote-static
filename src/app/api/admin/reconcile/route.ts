import { MutationStatus, ProofStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import { settleOrderInTransaction } from "@/lib/settlement";

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

  const mode = typeof body.mode === "string" ? body.mode : "";
  const note =
    typeof body.note === "string" && body.note.trim()
      ? body.note.trim().slice(0, 300)
      : null;

  if (mode === "LINK_MUTATION") {
    const orderId = typeof body.orderId === "string" ? body.orderId.trim() : "";
    const mutationId =
      typeof body.mutationId === "string" ? body.mutationId.trim() : "";
    const allowAmountMismatch = body.allowAmountMismatch === true;

    if (!orderId || !mutationId) {
      return NextResponse.json(
        { error: "orderId dan mutationId wajib diisi." },
        { status: 400 }
      );
    }

    try {
      const result = await prisma.$transaction(async (tx) => {
        const order = await tx.voteOrder.findUnique({
          where: { id: orderId },
        });
        const mutation = await tx.paymentMutation.findUnique({
          where: { id: mutationId },
        });

        if (!order || !mutation) {
          throw new Error("Order atau mutasi tidak ditemukan.");
        }
        if (mutation.status !== MutationStatus.UNMATCHED) {
          throw new Error("Hanya mutasi UNMATCHED yang dapat ditautkan.");
        }
        if (!allowAmountMismatch && mutation.amount !== order.totalAmount) {
          throw new Error(
            `Nominal mutasi (${mutation.amount}) tidak sama dengan tagihan order (${order.totalAmount}).`
          );
        }

        const settlement = await settleOrderInTransaction(tx, order.id, {
          allowLateOrExpired: true,
          paidAt: mutation.transactionAt,
        });

        if (!settlement.settled) {
          throw new Error(
            `Order gagal di-settle: ${settlement.reason ?? "unknown"}`
          );
        }

        await tx.paymentMutation.update({
          where: { id: mutation.id },
          data: {
            status: MutationStatus.MATCHED,
            matchedOrderId: order.id,
            eventId: order.eventId,
          },
        });

        await tx.manualProof.updateMany({
          where: { orderId: order.id, status: ProofStatus.PENDING_REVIEW },
          data: {
            status: ProofStatus.APPROVED,
            reviewedBy: "admin",
            reviewNote: note ?? "Disetujui via penautan mutasi manual",
          },
        });

        await tx.auditLog.create({
          data: {
            actor: "admin",
            action: "MANUAL_RECONCILE_LINK_MUTATION",
            targetId: order.id,
            metadata: {
              mutationId: mutation.id,
              rrn: mutation.rrn,
              mutationAmount: mutation.amount,
              orderTotalAmount: order.totalAmount,
              allowAmountMismatch,
              note,
            },
          },
        });

        return settlement;
      });

      return NextResponse.json({ ok: true, result });
    } catch (err) {
      return NextResponse.json(
        {
          error:
            err instanceof Error ? err.message : "Gagal menautkan mutasi.",
        },
        { status: 400 }
      );
    }
  }

  if (mode === "APPROVE_PROOF" || mode === "REJECT_PROOF") {
    const proofId = typeof body.proofId === "string" ? body.proofId.trim() : "";
    if (!proofId) {
      return NextResponse.json(
        { error: "proofId wajib diisi." },
        { status: 400 }
      );
    }

    try {
      const result = await prisma.$transaction(async (tx) => {
        const proof = await tx.manualProof.findUnique({
          where: { id: proofId },
        });
        if (!proof) {
          throw new Error("Bukti manual tidak ditemukan.");
        }
        if (proof.status !== ProofStatus.PENDING_REVIEW) {
          throw new Error(`Bukti manual sudah berstatus ${proof.status}.`);
        }

        if (mode === "REJECT_PROOF") {
          await tx.manualProof.update({
            where: { id: proof.id },
            data: {
              status: ProofStatus.REJECTED,
              reviewedBy: "admin",
              reviewNote: note ?? "Ditolak oleh admin",
            },
          });

          await tx.auditLog.create({
            data: {
              actor: "admin",
              action: "MANUAL_PROOF_REJECTED",
              targetId: proof.orderId,
              metadata: { proofId: proof.id, note },
            },
          });

          return { status: "REJECTED", orderId: proof.orderId };
        }

        const settlement = await settleOrderInTransaction(tx, proof.orderId, {
          allowLateOrExpired: true,
        });
        if (!settlement.settled) {
          throw new Error(
            `Order gagal di-settle: ${settlement.reason ?? "unknown"}`
          );
        }

        await tx.manualProof.update({
          where: { id: proof.id },
          data: {
            status: ProofStatus.APPROVED,
            reviewedBy: "admin",
            reviewNote: note ?? "Disetujui oleh admin",
          },
        });

        await tx.auditLog.create({
          data: {
            actor: "admin",
            action: "MANUAL_PROOF_APPROVED",
            targetId: proof.orderId,
            metadata: {
              proofId: proof.id,
              rrnInput: proof.rrnInput,
              note,
            },
          },
        });

        return { status: "APPROVED", settlement };
      });

      return NextResponse.json({ ok: true, result });
    } catch (err) {
      return NextResponse.json(
        {
          error:
            err instanceof Error
              ? err.message
              : "Gagal memproses bukti manual.",
        },
        { status: 400 }
      );
    }
  }

  return NextResponse.json(
    { error: "Mode rekonsiliasi tidak dikenali." },
    { status: 400 }
  );
}
