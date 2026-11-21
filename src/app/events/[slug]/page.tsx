import Link from "next/link";
import { OrderStatus } from "@prisma/client";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { expireStaleOrders } from "@/lib/unique-code";
import EventVotingClient, {
  PublicEventData,
} from "@/components/EventVotingClient";

export const dynamic = "force-dynamic";

export default async function EventSlugPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const event = await prisma.event.findUnique({
    where: { slug },
    include: {
      candidates: { orderBy: { number: "asc" } },
      orders: {
        where: {
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
      },
    },
  });

  if (!event) {
    notFound();
  }

  await expireStaleOrders(prisma, event.id);

  const publicEvent: PublicEventData = {
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
    totalVotes: event.isBlindMode
      ? null
      : event.candidates.reduce((sum, c) => sum + c.totalVotes, 0),
    candidates: event.candidates.map((c) => ({
      id: c.id,
      number: c.number,
      name: c.name,
      description: c.description,
      photoUrl: c.photoPath ? `/api/files/${c.photoPath}` : null,
      totalVotes: event.isBlindMode ? null : c.totalVotes,
    })),
    recentMessages: event.orders
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
  };

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3.5 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3 sm:gap-4">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 rounded-xl px-2 py-1 text-xs font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Beranda</span>
            </Link>
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 overflow-hidden rounded-xl border border-slate-200/80 bg-[#1C3458] shadow-xs">
                <img
                  src="/images/logo-icon.png"
                  alt="Logo Votingin"
                  className="h-full w-full object-cover"
                />
              </div>
              <span className="text-sm font-bold tracking-tight text-slate-900">
                Votingin
              </span>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1">
        <EventVotingClient initialEvent={publicEvent} />
      </main>
    </div>
  );
}
