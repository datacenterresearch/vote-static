import { MutationStatus, OrderStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { expireStaleOrders } from "@/lib/unique-code";

export interface SettleOrderResult {
  settled: boolean;
  reason?: string;
  orderId: string;
  candidateId?: string;
  voteQty?: number;
}

/**
 * Atomically transitions a VoteOrder to PAID (only from PENDING unless allowLate=true),
 * records an immutable VoteLedger entry, and increments Candidate.totalVotes.
 */
export async function settleOrderInTransaction(
  tx: Prisma.TransactionClient,
  orderId: string,
  options?: {
    allowLateOrExpired?: boolean;
    paidAt?: Date;
  }
): Promise<SettleOrderResult> {
  const paidAt = options?.paidAt ?? new Date();
  const allowedStatuses: OrderStatus[] = options?.allowLateOrExpired
    ? [OrderStatus.PENDING, OrderStatus.EXPIRED, OrderStatus.LATE_PAYMENT]
    : [OrderStatus.PENDING];

  const updated = await tx.voteOrder.updateMany({
    where: {
      id: orderId,
      status: { in: allowedStatuses },
    },
    data: {
      status: OrderStatus.PAID,
      paidAt,
    },
  });

  if (updated.count === 0) {
    const existing = await tx.voteOrder.findUnique({
      where: { id: orderId },
      select: { status: true },
    });
    return {
      settled: false,
      orderId,
      reason: existing
        ? `Order status is ${existing.status}`
        : "Order not found",
    };
  }

  const order = await tx.voteOrder.findUniqueOrThrow({
    where: { id: orderId },
    select: {
      id: true,
      candidateId: true,
      voteQty: true,
    },
  });

  await tx.voteLedger.create({
    data: {
      orderId: order.id,
      candidateId: order.candidateId,
      voteQty: order.voteQty,
      recordedAt: paidAt,
    },
  });

  await tx.candidate.update({
    where: { id: order.candidateId },
    data: {
      totalVotes: {
        increment: order.voteQty,
      },
    },
  });

  return {
    settled: true,
    orderId: order.id,
    candidateId: order.candidateId,
    voteQty: order.voteQty,
  };
}

export interface IncomingMutationInput {
  amount: number;
  rrn: string;
  rawMessage?: string;
  source: string;
  transactionAt: Date;
  eventId?: string;
}

export interface IncomingMutationResult {
  status: "MATCHED" | "UNMATCHED" | "DUPLICATE";
  mutationId?: string;
  matchedOrderId?: string;
  lateOrderId?: string;
  message: string;
}

/**
 * Processes an incoming bank/QRIS mutation (webhook or simulator):
 * - Rejects duplicate RRN idempotently
 * - Matches active PENDING VoteOrder by exact totalAmount
 * - Marks matching EXPIRED order as LATE_PAYMENT if payment arrived after expiry
 */
export async function processIncomingMutation(
  input: IncomingMutationInput
): Promise<IncomingMutationResult> {
  return prisma.$transaction(async (tx) => {
    const now = new Date();

    const existingRrn = await tx.paymentMutation.findUnique({
      where: { rrn: input.rrn },
      select: { id: true, status: true, matchedOrderId: true },
    });

    if (existingRrn) {
      await tx.auditLog.create({
        data: {
          actor: input.source,
          action: "DUPLICATE_MUTATION_IGNORED",
          targetId: existingRrn.id,
          metadata: {
            rrn: input.rrn,
            amount: input.amount,
          },
        },
      });

      return {
        status: "DUPLICATE",
        mutationId: existingRrn.id,
        matchedOrderId: existingRrn.matchedOrderId ?? undefined,
        message: `Mutasi dengan RRN ${input.rrn} sudah pernah diproses.`,
      };
    }

    await expireStaleOrders(tx, input.eventId, now);

    // 1. Try matching an active PENDING order
    const pendingOrder = await tx.voteOrder.findFirst({
      where: {
        ...(input.eventId ? { eventId: input.eventId } : {}),
        totalAmount: input.amount,
        status: OrderStatus.PENDING,
        expiresAt: { gt: now },
      },
      orderBy: { createdAt: "asc" },
    });

    if (pendingOrder) {
      const settlement = await settleOrderInTransaction(tx, pendingOrder.id, {
        paidAt: input.transactionAt,
      });

      const mutation = await tx.paymentMutation.create({
        data: {
          eventId: pendingOrder.eventId,
          amount: input.amount,
          rrn: input.rrn,
          rawMessage: input.rawMessage,
          source: input.source,
          status: MutationStatus.MATCHED,
          matchedOrderId: pendingOrder.id,
          transactionAt: input.transactionAt,
        },
      });

      await tx.auditLog.create({
        data: {
          actor: input.source,
          action: "AUTO_SETTLE_ORDER",
          targetId: pendingOrder.id,
          metadata: {
            mutationId: mutation.id,
            rrn: input.rrn,
            amount: input.amount,
            settled: settlement.settled,
          },
        },
      });

      return {
        status: "MATCHED",
        mutationId: mutation.id,
        matchedOrderId: pendingOrder.id,
        message: `Mutasi cocok dengan order ${pendingOrder.id} dan suara telah tercatat.`,
      };
    }

    // 2. Check if there is a recently EXPIRED order with the exact amount -> flag LATE_PAYMENT
    const lateCandidateOrder = await tx.voteOrder.findFirst({
      where: {
        ...(input.eventId ? { eventId: input.eventId } : {}),
        totalAmount: input.amount,
        status: OrderStatus.EXPIRED,
      },
      orderBy: { expiresAt: "desc" },
    });

    if (lateCandidateOrder) {
      await tx.voteOrder.update({
        where: { id: lateCandidateOrder.id },
        data: { status: OrderStatus.LATE_PAYMENT },
      });
    }

    const mutation = await tx.paymentMutation.create({
      data: {
        eventId: input.eventId ?? lateCandidateOrder?.eventId ?? null,
        amount: input.amount,
        rrn: input.rrn,
        rawMessage: input.rawMessage,
        source: input.source,
        status: MutationStatus.UNMATCHED,
        transactionAt: input.transactionAt,
      },
    });

    await tx.auditLog.create({
      data: {
        actor: input.source,
        action: lateCandidateOrder
          ? "UNMATCHED_MUTATION_LATE_PAYMENT"
          : "UNMATCHED_MUTATION",
        targetId: mutation.id,
        metadata: {
          rrn: input.rrn,
          amount: input.amount,
          lateOrderId: lateCandidateOrder?.id ?? null,
        },
      },
    });

    return {
      status: "UNMATCHED",
      mutationId: mutation.id,
      lateOrderId: lateCandidateOrder?.id,
      message: lateCandidateOrder
        ? `Tidak ada order PENDING aktif; terdeteksi order kedaluwarsa (${lateCandidateOrder.id}) ditandai LATE_PAYMENT untuk rekonsiliasi admin.`
        : "Tidak ada order PENDING yang cocok. Mutasi disimpan sebagai UNMATCHED.",
    };
  });
}
