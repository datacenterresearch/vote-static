import { OrderStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const MIN_PRICE_PER_VOTE = 1;
export const MAX_VOTE_QTY = 10_000;
export const MAX_TOTAL_ORDER_AMOUNT = 2_000_000_000;
export const ORDER_TTL_MINUTES = 15;

export interface OrderWindowEvent {
  isActive: boolean;
  startsAt: Date;
  endsAt: Date;
  orderCutoffMinutes: number;
}

export type OrderWindowResult =
  | { ok: true; expiresAt: Date }
  | { ok: false; code: string; reason: string };

/**
 * Validates whether an order can be placed right now and computes its expiration time.
 */
export function computeOrderWindow(
  now: Date,
  event: OrderWindowEvent
): OrderWindowResult {
  if (!event.isActive) {
    return {
      ok: false,
      code: "EVENT_INACTIVE",
      reason: "Event voting sedang tidak aktif.",
    };
  }

  if (now.getTime() < event.startsAt.getTime()) {
    return {
      ok: false,
      code: "EVENT_NOT_STARTED",
      reason: "Periode voting belum dimulai.",
    };
  }

  if (now.getTime() >= event.endsAt.getTime()) {
    return {
      ok: false,
      code: "EVENT_ENDED",
      reason: "Periode voting telah berakhir.",
    };
  }

  const cutoffAt =
    event.endsAt.getTime() - event.orderCutoffMinutes * 60_000;
  if (now.getTime() > cutoffAt) {
    return {
      ok: false,
      code: "ORDER_CUTOFF_REACHED",
      reason: `Pemesanan ditutup ${event.orderCutoffMinutes} menit sebelum event berakhir.`,
    };
  }

  const expiresAt = new Date(
    Math.min(now.getTime() + ORDER_TTL_MINUTES * 60_000, event.endsAt.getTime())
  );

  return { ok: true, expiresAt };
}

export async function expireStaleOrders(
  db: Prisma.TransactionClient | typeof prisma = prisma,
  eventId?: string,
  now: Date = new Date()
): Promise<number> {
  const result = await db.voteOrder.updateMany({
    where: {
      ...(eventId ? { eventId } : {}),
      status: OrderStatus.PENDING,
      expiresAt: { lte: now },
    },
    data: {
      status: OrderStatus.EXPIRED,
    },
  });
  return result.count;
}

export interface CreateVoteOrderInput {
  eventId: string;
  candidateId: string;
  voterName: string;
  voterContact?: string | null;
  isAnonymous?: boolean;
  supportMessage?: string | null;
  sessionKey: string;
  voteQty: number;
}

export class OrderAllocationError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number = 400
  ) {
    super(message);
    this.name = "OrderAllocationError";
  }
}

/**
 * Creates a VoteOrder with exact vote amount (without unique code), idempotent per sessionKey.
 */
export async function createVoteOrder(input: CreateVoteOrderInput) {
  return prisma.$transaction(async (tx) => {
    const now = new Date();
    const event = await tx.event.findUnique({
      where: { id: input.eventId },
    });

    if (!event) {
      throw new OrderAllocationError(
        "EVENT_NOT_FOUND",
        "Event tidak ditemukan.",
        404
      );
    }

    if (event.pricePerVote < MIN_PRICE_PER_VOTE) {
      throw new OrderAllocationError(
        "INVALID_EVENT_PRICE",
        `Harga per vote minimal Rp${MIN_PRICE_PER_VOTE}.`,
        400
      );
    }

    const candidate = await tx.candidate.findFirst({
      where: { id: input.candidateId, eventId: event.id },
    });
    if (!candidate) {
      throw new OrderAllocationError(
        "CANDIDATE_NOT_FOUND",
        "Kandidat tidak ditemukan pada event ini.",
        404
      );
    }

    await expireStaleOrders(tx, event.id, now);

    const windowCheck = computeOrderWindow(now, event);
    if (!windowCheck.ok) {
      throw new OrderAllocationError(
        windowCheck.code,
        windowCheck.reason,
        400
      );
    }

    // Idempotent checkout for same session + candidate + qty while PENDING
    const existingPending = await tx.voteOrder.findFirst({
      where: {
        eventId: event.id,
        candidateId: candidate.id,
        sessionKey: input.sessionKey,
        voteQty: input.voteQty,
        status: OrderStatus.PENDING,
        expiresAt: { gt: now },
      },
      orderBy: { createdAt: "desc" },
    });

    if (existingPending) {
      const updatedPending = await tx.voteOrder.update({
        where: { id: existingPending.id },
        data: {
          voterName: input.voterName,
          isAnonymous: Boolean(input.isAnonymous),
          supportMessage: input.supportMessage ?? null,
        },
      });
      return { order: updatedPending, reused: true };
    }

    const baseAmount = event.pricePerVote * input.voteQty;
    if (
      !Number.isSafeInteger(baseAmount) ||
      baseAmount > MAX_TOTAL_ORDER_AMOUNT
    ) {
      throw new OrderAllocationError(
        "AMOUNT_TOO_LARGE",
        "Total nominal transaksi melebihi batas maksimal sistem.",
        400
      );
    }

    const created = await tx.voteOrder.create({
      data: {
        eventId: event.id,
        candidateId: candidate.id,
        voterName: input.voterName,
        voterContact: input.voterContact ?? null,
        isAnonymous: Boolean(input.isAnonymous),
        supportMessage: input.supportMessage ?? null,
        sessionKey: input.sessionKey,
        voteQty: input.voteQty,
        baseAmount,
        uniqueCode: 0,
        totalAmount: baseAmount,
        status: OrderStatus.PENDING,
        expiresAt: windowCheck.expiresAt,
      },
    });

    return { order: created, reused: false };
  });
}
