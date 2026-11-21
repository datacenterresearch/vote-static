import { OrderStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const MIN_PRICE_PER_VOTE = 1000;
export const ORDER_TTL_MINUTES = 15;
export const QUARANTINE_MINUTES = 45;
export const MIN_UNIQUE_CODE = 1;
export const MAX_UNIQUE_CODE = 999;

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

export interface CodeHistoryEntry {
  uniqueCode: number;
  status: OrderStatus | string;
  expiresAt: Date;
  createdAt: Date;
  totalAmount?: number;
}

/**
 * Selects an available unique code (1..999) using LRU ordering while enforcing:
 * 1. No active PENDING code collision
 * 2. 45-minute quarantine after an order becomes EXPIRED (or LATE_PAYMENT)
 * 3. Optional totalAmount collision avoidance
 */
export function selectUniqueCodeLru(
  history: CodeHistoryEntry[],
  now: Date,
  baseAmount?: number
): number | null {
  const nowMs = now.getTime();
  const quarantineMs = QUARANTINE_MINUTES * 60_000;

  const blockedCodes = new Set<number>();
  const pendingAmounts = new Set<number>();
  const lastUsedMsByCode = new Map<number, number>();

  for (const entry of history) {
    const code = entry.uniqueCode;
    if (code < MIN_UNIQUE_CODE || code > MAX_UNIQUE_CODE) {
      continue;
    }

    const usedAtMs = entry.createdAt.getTime();
    const prevLastUsed = lastUsedMsByCode.get(code);
    if (prevLastUsed === undefined || usedAtMs > prevLastUsed) {
      lastUsedMsByCode.set(code, usedAtMs);
    }

    if (entry.status === "PENDING" && entry.expiresAt.getTime() > nowMs) {
      blockedCodes.add(code);
      if (entry.totalAmount !== undefined) {
        pendingAmounts.add(entry.totalAmount);
      }
    }

    if (
      (entry.status === "EXPIRED" || entry.status === "LATE_PAYMENT") &&
      entry.expiresAt.getTime() + quarantineMs > nowMs
    ) {
      blockedCodes.add(code);
    }
  }

  const candidates: Array<{ code: number; lastUsedMs: number }> = [];
  for (let code = MIN_UNIQUE_CODE; code <= MAX_UNIQUE_CODE; code++) {
    if (blockedCodes.has(code)) {
      continue;
    }
    if (baseAmount !== undefined && pendingAmounts.has(baseAmount + code)) {
      continue;
    }
    candidates.push({
      code,
      lastUsedMs: lastUsedMsByCode.get(code) ?? 0,
    });
  }

  if (candidates.length === 0) {
    return null;
  }

  candidates.sort((a, b) => {
    if (a.lastUsedMs !== b.lastUsedMs) {
      return a.lastUsedMs - b.lastUsedMs;
    }
    return a.code - b.code;
  });

  return candidates[0].code;
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
 * Creates a VoteOrder with an atomic unique code allocation, idempotent per sessionKey.
 */
export async function createVoteOrderWithUniqueCode(
  input: CreateVoteOrderInput
) {
  const maxRetries = 3;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await prisma.$transaction(async (tx) => {
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

        // Fetch orders relevant for active locks, quarantine, and LRU history
        const orders = await tx.voteOrder.findMany({
          where: { eventId: event.id },
          select: {
            uniqueCode: true,
            status: true,
            expiresAt: true,
            createdAt: true,
            totalAmount: true,
          },
        });

        const uniqueCode = selectUniqueCodeLru(orders, now, baseAmount);
        if (uniqueCode === null) {
          throw new OrderAllocationError(
            "UNIQUE_CODE_EXHAUSTED",
            "Antrean kode unik sedang penuh. Silakan coba beberapa saat lagi.",
            409
          );
        }

        const totalAmount = baseAmount + uniqueCode;

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
            uniqueCode,
            totalAmount,
            status: OrderStatus.PENDING,
            expiresAt: windowCheck.expiresAt,
          },
        });

        return { order: created, reused: false };
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002" &&
        attempt < maxRetries - 1
      ) {
        continue;
      }
      throw err;
    }
  }

  throw new OrderAllocationError(
    "ALLOCATION_CONFLICT",
    "Gagal mengalokasikan nominal unik karena trafik tinggi. Silakan coba lagi.",
    409
  );
}
