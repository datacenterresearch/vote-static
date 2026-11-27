import { OrderStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { expireStaleOrders } from "@/lib/unique-code";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  const { slug } = await context.params;

  const event = await prisma.event.findUnique({
    where: { slug },
    include: {
      candidates: {
        orderBy: { number: "asc" },
      },
    },
  });

  if (!event) {
    return NextResponse.json(
      { error: "Event tidak ditemukan" },
      { status: 404 }
    );
  }

  await expireStaleOrders(prisma, event.id);

  const recentSupportOrders = await prisma.voteOrder.findMany({
    where: {
      eventId: event.id,
      status: OrderStatus.PAID,
      supportMessage: { not: null },
    },
    orderBy: { paidAt: "desc" },
    take: 20,
    include: {
      candidate: {
        select: { number: true, name: true },
      },
    },
  });

  const totalVotes = event.isBlindMode
    ? null
    : event.candidates.reduce((sum, c) => sum + c.totalVotes, 0);

  return NextResponse.json({
    event: {
      id: event.id,
      slug: event.slug,
      title: event.title,
      description: event.description,
      pricePerVote: event.pricePerVote,
      qrisImageUrl: event.qrisImagePath
        ? `/api/files/${event.qrisImagePath}`
        : null,
      hasDynamicQris: Boolean(event.qrisRawPayload),
      startsAt: event.startsAt.toISOString(),
      endsAt: event.endsAt.toISOString(),
      orderCutoffMinutes: event.orderCutoffMinutes,
      isBlindMode: event.isBlindMode,
      isActive: event.isActive,
      totalVotes,
      candidates: event.candidates.map((c) => ({
        id: c.id,
        number: c.number,
        name: c.name,
        description: c.description,
        photoUrl: c.photoPath ? `/api/files/${c.photoPath}` : null,
        totalVotes: event.isBlindMode ? null : c.totalVotes,
      })),
      recentMessages: recentSupportOrders
        .filter((o) => Boolean(o.supportMessage?.trim()))
        .map((o) => ({
          id: o.id,
          voterName: o.isAnonymous ? "Anonim" : o.voterName,
          isAnonymous: o.isAnonymous,
          candidateNumber: o.candidate.number,
          candidateName: o.candidate.name,
          voteQty: o.voteQty,
          supportMessage: o.supportMessage as string,
          paidAt: o.paidAt ? o.paidAt.toISOString() : null,
        })),
    },
  });
}
