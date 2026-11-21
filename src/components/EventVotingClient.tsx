"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  Clock,
  EyeOff,
  Lock,
  QrCode,
  ShieldCheck,
  Sparkles,
  Trophy,
  Users,
  X,
} from "lucide-react";
import { formatDateTimeId, formatRupiah } from "@/lib/format";

export interface PublicCandidate {
  id: string;
  number: number;
  name: string;
  description: string | null;
  photoUrl: string | null;
  totalVotes: number | null;
}

export interface PublicEventData {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  pricePerVote: number;
  qrisImageUrl: string | null;
  hasDynamicQris: boolean;
  startsAt: string;
  endsAt: string;
  orderCutoffMinutes: number;
  isBlindMode: boolean;
  isActive: boolean;
  totalVotes: number | null;
  candidates: PublicCandidate[];
}

function getOrCreateSessionKey(): string {
  if (typeof window === "undefined") return "ssr-session";
  const storageKey = "vote_qris_session_key";
  let value = window.localStorage.getItem(storageKey);
  if (!value) {
    value =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `sess-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    window.localStorage.setItem(storageKey, value);
  }
  return value;
}

function formatRemaining(ms: number): string {
  if (ms <= 0) return "Berakhir";
  const totalSec = Math.floor(ms / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  if (days > 0) {
    return `${days}h ${hours}j ${minutes}m`;
  }
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(
    2,
    "0"
  )}:${String(seconds).padStart(2, "0")}`;
}

export default function EventVotingClient({
  initialEvent,
}: {
  initialEvent: PublicEventData;
}) {
  const router = useRouter();
  const [event, setEvent] = useState<PublicEventData>(initialEvent);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [selectedCandidate, setSelectedCandidate] =
    useState<PublicCandidate | null>(null);
  const [voterName, setVoterName] = useState("");
  const [voterContact, setVoterContact] = useState("");
  const [voteQty, setVoteQty] = useState<number>(1);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const poller = setInterval(async () => {
      try {
        const res = await fetch(`/api/events/${event.slug}`, {
          cache: "no-store",
        });
        if (res.ok) {
          const data = (await res.json()) as { event: PublicEventData };
          setEvent(data.event);
        }
      } catch {
        // ignore transient polling failure
      }
    }, 10000);
    return () => clearInterval(poller);
  }, [event.slug]);

  const startsMs = new Date(event.startsAt).getTime();
  const endsMs = new Date(event.endsAt).getTime();
  const cutoffMs = endsMs - event.orderCutoffMinutes * 60_000;

  const votingStatus = useMemo(() => {
    if (!event.isActive) {
      return { canVote: false, label: "Event Nonaktif", tone: "slate" };
    }
    if (nowMs < startsMs) {
      return { canVote: false, label: "Belum Dimulai", tone: "amber" };
    }
    if (nowMs >= endsMs) {
      return { canVote: false, label: "Voting Ditutup", tone: "rose" };
    }
    if (nowMs > cutoffMs) {
      return {
        canVote: false,
        label: `Order Ditutup (${event.orderCutoffMinutes}m sebelum selesai)`,
        tone: "amber",
      };
    }
    return { canVote: true, label: "Voting Sedang Berlangsung", tone: "emerald" };
  }, [event.isActive, event.orderCutoffMinutes, nowMs, startsMs, endsMs, cutoffMs]);

  const sortedLeaderboard = useMemo(() => {
    if (event.isBlindMode) return [];
    return [...event.candidates].sort(
      (a, b) => (b.totalVotes ?? 0) - (a.totalVotes ?? 0)
    );
  }, [event.candidates, event.isBlindMode]);

  async function handleCheckout(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedCandidate) return;
    setErrorMsg(null);
    setSubmitting(true);

    try {
      const sessionKey = getOrCreateSessionKey();
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId: event.id,
          candidateId: selectedCandidate.id,
          voterName,
          voterContact,
          sessionKey,
          voteQty,
        }),
      });

      const data = (await res.json()) as {
        order?: { id: string };
        error?: string;
      };

      if (!res.ok || !data.order) {
        setErrorMsg(data.error ?? "Gagal membuat pesanan vote.");
        return;
      }

      router.push(`/pay/${data.order.id}`);
    } catch {
      setErrorMsg("Terjadi gangguan jaringan saat membuat order.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Header Banner */}
      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="bg-gradient-to-br from-indigo-950 via-slate-900 to-indigo-900 px-6 py-8 text-white sm:px-10 sm:py-10">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3.5 py-1 text-xs font-medium text-indigo-100 backdrop-blur">
              <QrCode className="h-3.5 w-3.5" />
              <span>Pembayaran QRIS Statis + Kode Unik Otomatis</span>
            </div>
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
                votingStatus.canVote
                  ? "bg-emerald-500/20 text-emerald-200 ring-1 ring-emerald-400/40"
                  : "bg-amber-500/20 text-amber-200 ring-1 ring-amber-400/40"
              }`}
            >
              <Clock className="h-3.5 w-3.5" />
              {votingStatus.label}
            </span>
          </div>

          <h1 className="mt-4 text-2xl font-bold tracking-tight sm:text-4xl">
            {event.title}
          </h1>
          {event.description && (
            <p className="mt-3 max-w-3xl text-sm leading-relaxed text-slate-300 sm:text-base">
              {event.description}
            </p>
          )}

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl bg-white/10 px-4 py-3 backdrop-blur">
              <div className="text-xs text-slate-300">Harga 1 Vote</div>
              <div className="mt-1 text-lg font-bold text-white">
                {formatRupiah(event.pricePerVote)}
              </div>
            </div>
            <div className="rounded-2xl bg-white/10 px-4 py-3 backdrop-blur">
              <div className="text-xs text-slate-300">
                {nowMs < startsMs ? "Mulai Dalam" : "Sisa Waktu Voting"}
              </div>
              <div className="mt-1 font-mono text-lg font-bold text-white">
                {nowMs < startsMs
                  ? formatRemaining(startsMs - nowMs)
                  : formatRemaining(endsMs - nowMs)}
              </div>
              <div className="text-[11px] text-slate-300">
                Tutup: {formatDateTimeId(event.endsAt)}
              </div>
            </div>
            <div className="rounded-2xl bg-white/10 px-4 py-3 backdrop-blur">
              <div className="text-xs text-slate-300">Total Suara Sah</div>
              <div className="mt-1 flex items-center gap-2 text-lg font-bold text-white">
                {event.isBlindMode ? (
                  <>
                    <EyeOff className="h-4 w-4 text-amber-300" />
                    <span>Blind Mode Aktif</span>
                  </>
                ) : (
                  <>
                    <Users className="h-4 w-4 text-emerald-300" />
                    <span>
                      {new Intl.NumberFormat("id-ID").format(
                        event.totalVotes ?? 0
                      )}{" "}
                      Suara
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Leaderboard / Blind Mode */}
      <section className="mt-8">
        {event.isBlindMode ? (
          <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
            <Lock className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <div>
              <h2 className="text-sm font-semibold">
                Mode Perolehan Tertutup (Blind Mode)
              </h2>
              <p className="mt-0.5 text-xs text-amber-800 sm:text-sm">
                Perolehan suara sementara disembunyikan oleh panitia untuk
                menjaga objektivitas hingga pengumuman resmi.
              </p>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
              <Trophy className="h-4 w-4 text-amber-500" />
              <span>Klasemen Sementara</span>
            </div>
            <div className="mt-4 space-y-3">
              {sortedLeaderboard.map((cand, idx) => {
                const votes = cand.totalVotes ?? 0;
                const total = event.totalVotes ?? 0;
                const pct = total > 0 ? Math.round((votes / total) * 100) : 0;
                return (
                  <div key={cand.id}>
                    <div className="flex items-center justify-between text-xs sm:text-sm">
                      <span className="font-medium text-slate-700">
                        #{idx + 1} — No. {cand.number} {cand.name}
                      </span>
                      <span className="font-semibold text-slate-900">
                        {new Intl.NumberFormat("id-ID").format(votes)} suara (
                        {pct}%)
                      </span>
                    </div>
                    <div className="mt-1.5 h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-indigo-600 transition-all duration-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
              {sortedLeaderboard.length === 0 && (
                <p className="text-sm text-slate-500">
                  Belum ada kandidat yang terdaftar.
                </p>
              )}
            </div>
          </div>
        )}
      </section>

      {/* Candidates Grid */}
      <section className="mt-8">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-slate-900">Daftar Kandidat</h2>
          <span className="text-xs text-slate-500">
            Pilih kandidat untuk memberi dukungan suara
          </span>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {event.candidates.map((cand) => (
            <div
              key={cand.id}
              className="flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:shadow-md"
            >
              <div className="relative aspect-[4/3] w-full bg-slate-100">
                {cand.photoUrl ? (
                  <img
                    src={cand.photoUrl}
                    alt={cand.name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200 text-slate-400">
                    <span className="text-4xl font-black">#{cand.number}</span>
                  </div>
                )}
                <span className="absolute left-3 top-3 rounded-full bg-slate-900/85 px-3 py-1 text-xs font-bold text-white backdrop-blur">
                  No. Urut {cand.number}
                </span>
              </div>

              <div className="flex flex-1 flex-col p-5">
                <h3 className="text-lg font-bold text-slate-900">
                  {cand.name}
                </h3>
                {cand.description && (
                  <p className="mt-1.5 line-clamp-3 text-sm text-slate-600">
                    {cand.description}
                  </p>
                )}

                <div className="mt-auto pt-5">
                  {!event.isBlindMode && (
                    <div className="mb-3 flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-xs">
                      <span className="text-slate-500">Perolehan Suara</span>
                      <span className="font-bold text-indigo-700">
                        {new Intl.NumberFormat("id-ID").format(
                          cand.totalVotes ?? 0
                        )}{" "}
                        suara
                      </span>
                    </div>
                  )}

                  <button
                    type="button"
                    disabled={!votingStatus.canVote}
                    onClick={() => {
                      setErrorMsg(null);
                      setVoteQty(1);
                      setSelectedCandidate(cand);
                    }}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500"
                  >
                    <Sparkles className="h-4 w-4" />
                    <span>
                      {votingStatus.canVote
                        ? "Vote Kandidat Ini"
                        : "Voting Tidak Tersedia"}
                    </span>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Checkout Modal */}
      {selectedCandidate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-indigo-600">
                  Checkout Vote
                </span>
                <h3 className="mt-0.5 text-lg font-bold text-slate-900">
                  No. {selectedCandidate.number} — {selectedCandidate.name}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedCandidate(null)}
                className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                aria-label="Tutup modal"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCheckout} className="mt-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  Jumlah Vote
                </label>
                <div className="mt-1.5 flex items-center gap-2">
                  {[1, 5, 10, 25].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setVoteQty(preset)}
                      className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                        voteQty === preset
                          ? "border-indigo-600 bg-indigo-50 text-indigo-700"
                          : "border-slate-200 text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      {preset}x
                    </button>
                  ))}
                  <input
                    type="number"
                    min={1}
                    max={1000}
                    value={voteQty}
                    onChange={(e) =>
                      setVoteQty(
                        Math.max(1, Math.min(1000, Number(e.target.value) || 1))
                      )
                    }
                    className="w-24 rounded-lg border border-slate-300 px-3 py-1.5 text-center text-sm font-semibold focus:border-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  Nama Pemilih
                </label>
                <input
                  type="text"
                  required
                  minLength={2}
                  placeholder="Contoh: Budi Santoso"
                  value={voterName}
                  onChange={(e) => setVoterName(e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  Kontak (WhatsApp / Email)
                </label>
                <input
                  type="text"
                  required
                  minLength={4}
                  placeholder="Contoh: 081234567890"
                  value={voterContact}
                  onChange={(e) => setVoterContact(e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div className="rounded-2xl bg-slate-50 p-3.5 text-xs text-slate-600">
                <div className="flex justify-between">
                  <span>Subtotal ({voteQty} vote)</span>
                  <span className="font-semibold text-slate-900">
                    {formatRupiah(event.pricePerVote * voteQty)}
                  </span>
                </div>
                <div className="mt-1 flex items-center gap-1.5 text-[11px] text-indigo-700">
                  <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
                  <span>
                    Sistem akan menambahkan kode unik 3 digit agar pembayaran
                    QRIS terverifikasi otomatis.
                  </span>
                </div>
              </div>

              {errorMsg && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-700">
                  {errorMsg}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:bg-indigo-400"
              >
                <CheckCircle2 className="h-4 w-4" />
                <span>
                  {submitting ? "Membuat Tagihan..." : "Lanjut ke Pembayaran QRIS"}
                </span>
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
