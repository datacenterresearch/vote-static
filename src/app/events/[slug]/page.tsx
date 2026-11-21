import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ShieldCheck, Vote } from "lucide-react";
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
  };

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Beranda</span>
            </Link>
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white">
                <Vote className="h-4 w-4" />
              </div>
              <span className="text-sm font-bold text-slate-900">VoteQRIS</span>
            </div>
          </div>
          <Link
            href="/admin"
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            <ShieldCheck className="h-4 w-4 text-indigo-600" />
            <span>Admin</span>
          </Link>
        </div>
      </header>

      <main className="flex-1">
        <EventVotingClient initialEvent={publicEvent} />
      </main>
    </div>
  );
}
