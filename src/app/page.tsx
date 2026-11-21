import Link from "next/link";
import { ArrowRight, QrCode, ShieldCheck, Vote } from "lucide-react";
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
  }> = [];

  let dbError = false;
  try {
    events = await prisma.event.findMany({
      where: { isActive: true },
      orderBy: { createdAt: "desc" },
      include: {
        candidates: { orderBy: { number: "asc" } },
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
  });

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 text-white">
              <Vote className="h-5 w-5" />
            </div>
            <div>
              <div className="text-sm font-bold text-slate-900">VoteQRIS</div>
              <div className="text-[11px] text-slate-500">
                Voting QRIS Statis Teraudit
              </div>
            </div>
          </Link>
          <Link
            href="/admin"
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            <ShieldCheck className="h-4 w-4 text-indigo-600" />
            <span>Panel Panitia</span>
          </Link>
        </div>
      </header>

      <main className="flex-1">
        {dbError ? (
          <div className="mx-auto max-w-2xl px-4 py-16 text-center">
            <div className="rounded-3xl border border-amber-200 bg-amber-50 p-8">
              <h1 className="text-xl font-bold text-amber-900">
                Database Belum Terhubung
              </h1>
              <p className="mt-2 text-sm text-amber-800">
                Pastikan PostgreSQL sudah berjalan dan migrasi Prisma telah
                dijalankan. Cek status koneksi melalui{" "}
                <code className="rounded bg-amber-100 px-1.5 py-0.5">
                  /api/health
                </code>
                .
              </p>
            </div>
          </div>
        ) : events.length === 0 ? (
          <div className="mx-auto max-w-2xl px-4 py-16 text-center">
            <div className="rounded-3xl border border-slate-200 bg-white p-10 shadow-sm">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
                <QrCode className="h-7 w-7" />
              </div>
              <h1 className="mt-5 text-2xl font-bold text-slate-900">
                Belum Ada Event Voting Aktif
              </h1>
              <p className="mt-2 text-sm text-slate-600">
                Panitia dapat masuk ke Dashboard Admin untuk membuat event baru,
                mengunggah QRIS statis, dan menambahkan kandidat.
              </p>
              <Link
                href="/admin"
                className="mt-6 inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700"
              >
                <span>Buka Dashboard Panitia</span>
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        ) : events.length === 1 ? (
          <EventVotingClient initialEvent={mapEvent(events[0])} />
        ) : (
          <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
            <h1 className="text-2xl font-bold text-slate-900">
              Event Voting Aktif
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              Pilih event di bawah ini untuk melihat kandidat dan memberikan
              suara.
            </p>
            <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {events.map((ev) => (
                <Link
                  key={ev.id}
                  href={`/events/${ev.slug}`}
                  className="group flex flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:border-indigo-300 hover:shadow-md"
                >
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span>{ev.candidates.length} Kandidat</span>
                    <span className="font-semibold text-indigo-600">
                      {formatRupiah(ev.pricePerVote)} / vote
                    </span>
                  </div>
                  <h2 className="mt-3 text-lg font-bold text-slate-900 group-hover:text-indigo-700">
                    {ev.title}
                  </h2>
                  {ev.description && (
                    <p className="mt-2 line-clamp-2 text-sm text-slate-600">
                      {ev.description}
                    </p>
                  )}
                  <div className="mt-auto pt-5 text-xs text-slate-500">
                    <div>Berakhir: {formatDateTimeId(ev.endsAt)}</div>
                    <div className="mt-3 inline-flex items-center gap-1 font-semibold text-indigo-600">
                      <span>Masuk Halaman Voting</span>
                      <ArrowRight className="h-3.5 w-3.5" />
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
