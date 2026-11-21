import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import { expireStaleOrders } from "@/lib/unique-code";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await expireStaleOrders(prisma);

  const [
    events,
    orders,
    mutations,
    proofs,
    heartbeats,
    auditLogs,
    paidOrdersAgg,
    matchedMutationsAgg,
    ledgerAgg,
  ] = await Promise.all([
    prisma.event.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        candidates: { orderBy: { number: "asc" } },
      },
    }),
    prisma.voteOrder.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        event: { select: { title: true, slug: true } },
        candidate: { select: { number: true, name: true } },
      },
    }),
    prisma.paymentMutation.findMany({
      orderBy: { receivedAt: "desc" },
      take: 100,
    }),
    prisma.manualProof.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        order: {
          include: {
            event: { select: { title: true, slug: true } },
            candidate: { select: { number: true, name: true } },
          },
        },
      },
    }),
    prisma.listenerHeartbeat.findMany({
      orderBy: { lastPingAt: "desc" },
    }),
    prisma.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.voteOrder.findMany({
      where: { status: "PAID" },
      select: {
        totalAmount: true,
        baseAmount: true,
        uniqueCode: true,
        voteQty: true,
        event: { select: { pricePerVote: true } },
      },
    }),
    prisma.paymentMutation.aggregate({
      where: { status: "MATCHED" },
      _sum: { amount: true },
      _count: true,
    }),
    prisma.voteLedger.aggregate({
      _sum: { voteQty: true },
      _count: true,
    }),
  ]);

  const totalPaidAmount = paidOrdersAgg.reduce(
    (sum, o) => sum + o.totalAmount,
    0
  );
  const totalBaseRevenue = paidOrdersAgg.reduce(
    (sum, o) => sum + o.voteQty * o.event.pricePerVote,
    0
  );
  const totalUniqueCodeRevenue = paidOrdersAgg.reduce(
    (sum, o) => sum + o.uniqueCode,
    0
  );

  return NextResponse.json({
    summary: {
      totalPaidAmount,
      totalBaseRevenue,
      totalUniqueCodeRevenue,
      totalMatchedMutationsAmount: matchedMutationsAgg._sum.amount ?? 0,
      totalMatchedMutationsCount: matchedMutationsAgg._count,
      totalVotesRecorded: ledgerAgg._sum.voteQty ?? 0,
      totalLedgerEntries: ledgerAgg._count,
    },
    events: events.map((e) => ({
      ...e,
      startsAt: e.startsAt.toISOString(),
      endsAt: e.endsAt.toISOString(),
      createdAt: e.createdAt.toISOString(),
      updatedAt: e.updatedAt.toISOString(),
      qrisImageUrl: e.qrisImagePath ? `/api/files/${e.qrisImagePath}` : null,
      candidates: e.candidates.map((c) => ({
        ...c,
        photoUrl: c.photoPath ? `/api/files/${c.photoPath}` : null,
        createdAt: c.createdAt.toISOString(),
        updatedAt: c.updatedAt.toISOString(),
      })),
    })),
    orders: orders.map((o) => ({
      ...o,
      expiresAt: o.expiresAt.toISOString(),
      paidAt: o.paidAt ? o.paidAt.toISOString() : null,
      createdAt: o.createdAt.toISOString(),
    })),
    mutations: mutations.map((m) => ({
      ...m,
      transactionAt: m.transactionAt.toISOString(),
      receivedAt: m.receivedAt.toISOString(),
    })),
    proofs: proofs.map((p) => ({
      ...p,
      imageUrl: `/api/files/${p.imagePath}`,
      createdAt: p.createdAt.toISOString(),
      order: {
        ...p.order,
        expiresAt: p.order.expiresAt.toISOString(),
        paidAt: p.order.paidAt ? p.order.paidAt.toISOString() : null,
        createdAt: p.order.createdAt.toISOString(),
      },
    })),
    heartbeats: heartbeats.map((h) => ({
      ...h,
      lastPingAt: h.lastPingAt.toISOString(),
    })),
    auditLogs: auditLogs.map((a) => ({
      ...a,
      createdAt: a.createdAt.toISOString(),
    })),
  });
}
