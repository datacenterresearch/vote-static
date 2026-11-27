import { notFound, redirect } from "next/navigation";
import AdminEventPrintClient from "@/components/AdminEventPrintClient";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function AdminEventPrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const authenticated = await isAdminAuthenticated();
  if (!authenticated) {
    redirect("/admin/login");
  }

  const { id } = await params;

  const [event, allEvents, orders, ledgerAgg, matchedMutationsAgg] =
    await Promise.all([
      prisma.event.findUnique({
        where: { id },
        include: {
          candidates: {
            orderBy: [{ totalVotes: "desc" }, { number: "asc" }],
          },
        },
      }),
      prisma.event.findMany({
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          title: true,
          slug: true,
          isActive: true,
        },
      }),
      prisma.voteOrder.findMany({
        where: { eventId: id },
        orderBy: { createdAt: "asc" },
        include: {
          candidate: {
            select: {
              number: true,
              name: true,
            },
          },
        },
      }),
      prisma.voteLedger.aggregate({
        where: { order: { eventId: id } },
        _sum: { voteQty: true },
        _count: true,
      }),
      prisma.paymentMutation.aggregate({
        where: { eventId: id, status: "MATCHED" },
        _sum: { amount: true },
        _count: true,
      }),
    ]);

  if (!event) {
    notFound();
  }

  const paidOrders = orders.filter((o) => o.status === "PAID");
  const totalPaidAmount = paidOrders.reduce((s, o) => s + o.totalAmount, 0);
  const totalBaseRevenue = paidOrders.reduce(
    (s, o) => s + o.voteQty * event.pricePerVote,
    0
  );
  const totalCandidateVotes = event.candidates.reduce(
    (s, c) => s + c.totalVotes,
    0
  );

  const statusCounts = {
    PAID: 0,
    PENDING: 0,
    EXPIRED: 0,
    LATE_PAYMENT: 0,
    CANCELLED: 0,
  };
  for (const o of orders) {
    if (o.status in statusCounts) {
      statusCounts[o.status as keyof typeof statusCounts] += 1;
    }
  }

  const printedAt = new Date().toISOString();

  return (
    <AdminEventPrintClient
      event={{
        id: event.id,
        slug: event.slug,
        title: event.title,
        description: event.description,
        pricePerVote: event.pricePerVote,
        startsAt: event.startsAt.toISOString(),
        endsAt: event.endsAt.toISOString(),
        orderCutoffMinutes: event.orderCutoffMinutes,
        isBlindMode: event.isBlindMode,
        isActive: event.isActive,
        candidates: event.candidates.map((c) => ({
          id: c.id,
          number: c.number,
          name: c.name,
          description: c.description,
          totalVotes: c.totalVotes,
        })),
      }}
      allEvents={allEvents}
      paidOrders={paidOrders.map((o) => ({
        id: o.id,
        voterName: o.voterName,
        isAnonymous: o.isAnonymous,
        supportMessage: o.supportMessage,
        voteQty: o.voteQty,
        baseAmount: o.baseAmount,
        totalAmount: o.totalAmount,
        paidAt: o.paidAt ? o.paidAt.toISOString() : null,
        createdAt: o.createdAt.toISOString(),
        candidate: o.candidate,
      }))}
      summary={{
        totalVotes: ledgerAgg._sum.voteQty ?? totalCandidateVotes,
        totalCandidateVotes,
        ledgerEntries: ledgerAgg._count,
        totalOrders: orders.length,
        paidOrdersCount: paidOrders.length,
        totalPaidAmount,
        totalBaseRevenue,
        matchedMutationsCount: matchedMutationsAgg._count,
        matchedMutationsAmount: matchedMutationsAgg._sum.amount ?? 0,
        statusCounts,
      }}
      printedAt={printedAt}
    />
  );
}
