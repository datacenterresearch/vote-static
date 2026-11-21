import Link from "next/link";
import { OrderStatus } from "@prisma/client";
import { ArrowRight, Calendar, QrCode, ShieldCheck, Vote } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { formatDateTimeId, formatRupiah } from "@/lib/format";
import EventVotingClient, {
  PublicEventData,
} from "@/components/EventVotingClient";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  let events: Array<{
    id: string;
    slug: string;
    title: string;
    description: string | null;
    pricePerVote: number;
    qrisImagePath: string | null;
    qrisRawPayload: string | null;
    startsAt: Date;
    endsAt: Date;
    orderCutoffMinutes: number;
    isBlindMode: boolean;
    isActive: boolean;
    candidates: Array<{
      id: string;
      number: number;
      name: string;
      description: string | null;
      photoPath: string | null;
      totalVotes: number;
    }>;
    orders: Array<{
      id: string;
      voterName: string;
      isAnonymous: boolean;
      voteQty: number;
      supportMessage: string | null;
      paidAt: Date | null;
      candidate: {
        number: number;
        name: string;
      };
    }>;
  }> = [];

  let dbError = false;
  try {
    events = await prisma.event.findMany({
      where: { isActive: true },
      orderBy: { createdAt: "desc" },
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
  } catch {
    dbError = true;
  }

  const mapEvent = (e: (typeof events)[number]): PublicEventData => ({
    id: e.id,
    slug: e.slug,
    title: e.title,
    description: e.description,
    pricePerVote: e.pricePerVote,
    qrisImageUrl: e.qrisImagePath ? `/api/files/${e.qrisImagePath}` : null,
    hasDynamicQris: Boolean(e.qrisRawPayload),
    startsAt: e.startsAt.toISOString(),
    endsAt: e.endsAt.toISOString(),
    orderCutoffMinutes: e.orderCutoffMinutes,
    isBlindMode: e.isBlindMode,
    isActive: e.isActive,
    totalVotes: e.isBlindMode
      ? null
      : e.candidates.reduce((sum, c) => sum + c.totalVotes, 0),
    candidates: e.candidates.map((c) => ({
      id: c.id,
      number: c.number,
      name: c.name,
      description: c.description,
      photoUrl: c.photoPath ? `/api/files/${c.photoPath}` : null,
      totalVotes: e.isBlindMode ? null : c.totalVotes,
    })),
    recentMessages: e.orders
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
  });

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3.5 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-xs">
              <Vote className="h-5 w-5" />
            </div>
            <div>
              <div className="text-sm font-bold tracking-tight text-slate-900">
                VoteQRIS
              </div>
              <div className="text-[11px] text-slate-500">Voting Digital</div>
            </div>
          </Link>
          <Link
            href="/admin"
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-2xs transition hover:border-indigo-200 hover:bg-slate-50"
          >
            <ShieldCheck className="h-4 w-4 text-indigo-600" />
            <span>Admin</span>
          </Link>
        </div>
      </header>

      <main className="flex-1">
        {dbError ? (
          <div className="mx-auto max-w-xl px-4 py-16 text-center">
            <div className="rounded-3xl border border-amber-200 bg-amber-50 p-8 shadow-xs">
              <h1 className="text-xl font-bold text-amber-900">
                Layanan Sedang Disiapkan
              </h1>
              <p className="mt-2 text-sm text-amber-800">
                Koneksi database belum tersedia. Silakan coba beberapa saat
                lagi.
              </p>
            </div>
          </div>
        ) : events.length === 0 ? (
          <div className="mx-auto max-w-xl px-4 py-16 text-center">
            <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm sm:p-10">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
                <QrCode className="h-7 w-7" />
              </div>
              <h1 className="mt-5 text-2xl font-bold text-slate-900">
                Belum Ada Event Aktif
              </h1>
              <p className="mt-2 text-sm text-slate-600">
                Panitia dapat membuat event baru dan menambahkan kandidat
                melalui halaman Admin.
              </p>
              <Link
                href="/admin"
                className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700"
              >
                <span>Buka Halaman Admin</span>
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        ) : events.length === 1 ? (
          <EventVotingClient initialEvent={mapEvent(events[0])} />
        ) : (
          <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
                Event Voting Aktif
              </h1>
              <p className="mt-1 text-sm text-slate-600">
                Pilih event untuk melihat kandidat dan memberikan suara.
              </p>
            </div>

            <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {events.map((ev) => (
                <Link
                  key={ev.id}
                  href={`/events/${ev.slug}`}
                  className="group flex flex-col rounded-3xl border border-slate-200/90 bg-white p-6 shadow-xs transition hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-md"
                >
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-700">
                      {ev.candidates.length} Kandidat
                    </span>
                    <span className="font-bold text-indigo-600">
                      {formatRupiah(ev.pricePerVote)} / vote
                    </span>
                  </div>
                  <h2 className="mt-4 text-lg font-bold text-slate-900 group-hover:text-indigo-700">
                    {ev.title}
                  </h2>
                  {ev.description && (
                    <p className="mt-2 line-clamp-2 text-sm text-slate-600">
                      {ev.description}
                    </p>
                  )}
                  <div className="mt-auto pt-5 text-xs text-slate-500">
                    <div className="flex items-center gap-1.5">
                      <Calendar className="h-3.5 w-3.5 text-slate-400" />
                      <span>Ditutup: {formatDateTimeId(ev.endsAt)}</span>
                    </div>
                    <div className="mt-3 inline-flex items-center gap-1 font-semibold text-indigo-600">
                      <span>Buka Voting</span>
                      <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
