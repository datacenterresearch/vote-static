"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  Clock,
  EyeOff,
  Heart,
  Lock,
  MessageSquareHeart,
  Sparkles,
  Trophy,
  UserCheck,
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

export interface SupportMessageItem {
  id: string;
  voterName: string;
  isAnonymous: boolean;
  candidateNumber: number;
  candidateName: string;
  voteQty: number;
  supportMessage: string;
  paidAt: string | null;
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
  recentMessages: SupportMessageItem[];
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
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [supportMessage, setSupportMessage] = useState("");
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
        label: `Pemesanan Ditutup (${event.orderCutoffMinutes}m sebelum selesai)`,
        tone: "amber",
      };
    }
    return { canVote: true, label: "Voting Dibuka", tone: "emerald" };
  }, [
    event.isActive,
    event.orderCutoffMinutes,
    nowMs,
    startsMs,
    endsMs,
    cutoffMs,
  ]);

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
          voterName: isAnonymous ? "Anonim" : voterName,
          isAnonymous,
          supportMessage: supportMessage.trim() || undefined,
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
      setErrorMsg("Terjadi gangguan jaringan saat memproses pesanan.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      {/* Hero Banner */}
      <section className="relative overflow-hidden rounded-3xl border border-slate-200/80 bg-slate-950 text-white shadow-lg">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-indigo-500/25 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -left-16 h-64 w-64 rounded-full bg-sky-500/20 blur-3xl" />

        <div className="relative bg-gradient-to-br from-slate-900/95 via-indigo-950/90 to-slate-900/95 px-5 py-7 sm:px-10 sm:py-10">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1 text-xs font-semibold ${
                votingStatus.canVote
                  ? "bg-emerald-500/20 text-emerald-200 ring-1 ring-emerald-400/40"
                  : votingStatus.tone === "rose"
                  ? "bg-rose-500/20 text-rose-200 ring-1 ring-rose-400/40"
                  : "bg-amber-500/20 text-amber-200 ring-1 ring-amber-400/40"
              }`}
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  votingStatus.canVote
                    ? "animate-pulse bg-emerald-400"
                    : votingStatus.tone === "rose"
                    ? "bg-rose-400"
                    : "bg-amber-400"
                }`}
              />
              {votingStatus.label}
            </span>

            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-indigo-100">
              {event.candidates.length} Kandidat
            </span>
          </div>

          <h1 className="mt-4 text-2xl font-extrabold tracking-tight sm:text-4xl">
            {event.title}
          </h1>
          {event.description && (
            <p className="mt-2.5 max-w-3xl text-sm leading-relaxed text-slate-300 sm:text-base">
              {event.description}
            </p>
          )}

          <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3.5 backdrop-blur-sm">
              <div className="text-xs font-medium text-slate-300">
                Harga per Vote
              </div>
              <div className="mt-1 text-xl font-bold text-white">
                {formatRupiah(event.pricePerVote)}
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3.5 backdrop-blur-sm">
              <div className="flex items-center gap-1.5 text-xs font-medium text-slate-300">
                <Clock className="h-3.5 w-3.5 text-indigo-300" />
                <span>
                  {nowMs < startsMs ? "Mulai Dalam" : "Sisa Waktu Voting"}
                </span>
              </div>
              <div
                suppressHydrationWarning
                className="mt-1 font-mono text-xl font-bold text-white"
              >
                {nowMs < startsMs
                  ? formatRemaining(startsMs - nowMs)
                  : formatRemaining(endsMs - nowMs)}
              </div>
              <div className="mt-0.5 text-[11px] text-slate-400">
                Ditutup: {formatDateTimeId(event.endsAt)}
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3.5 backdrop-blur-sm">
              <div className="text-xs font-medium text-slate-300">
                Total Suara Masuk
              </div>
              <div className="mt-1 flex items-center gap-2 text-xl font-bold text-white">
                {event.isBlindMode ? (
                  <>
                    <EyeOff className="h-4 w-4 text-amber-300" />
                    <span>Disembunyikan</span>
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
      <section className="mt-7">
        {event.isBlindMode ? (
          <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50/90 p-4 text-amber-900 shadow-xs">
            <Lock className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <div>
              <h2 className="text-sm font-semibold">
                Perolehan Suara Disembunyikan
              </h2>
              <p className="mt-0.5 text-xs text-amber-800 sm:text-sm">
                Hasil suara sementara akan diumumkan resmi oleh panitia.
              </p>
            </div>
          </div>
        ) : (
          <div className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-xs sm:p-6">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-900 sm:text-base">
                <Trophy className="h-5 w-5 text-amber-500" />
                <span>Klasemen Sementara</span>
              </div>
              <span className="text-xs text-slate-500">
                Diperbarui otomatis
              </span>
            </div>

            <div className="mt-4 space-y-3.5">
              {sortedLeaderboard.map((cand, idx) => {
                const votes = cand.totalVotes ?? 0;
                const total = event.totalVotes ?? 0;
                const pct = total > 0 ? Math.round((votes / total) * 100) : 0;
                const rankBadge =
                  idx === 0
                    ? "bg-amber-100 text-amber-800 ring-1 ring-amber-300"
                    : idx === 1
                    ? "bg-slate-200 text-slate-700"
                    : idx === 2
                    ? "bg-orange-100 text-orange-800"
                    : "bg-slate-100 text-slate-600";
                return (
                  <div key={cand.id} className="space-y-1.5">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs sm:text-sm">
                      <div className="flex items-center gap-2">
                        <span
                          className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold ${rankBadge}`}
                        >
                          {idx + 1}
                        </span>
                        <span className="font-semibold text-slate-800">
                          No. {cand.number} — {cand.name}
                        </span>
                      </div>
                      <span className="font-bold text-slate-900">
                        {new Intl.NumberFormat("id-ID").format(votes)} suara{" "}
                        <span className="font-semibold text-indigo-600">
                          ({pct}%)
                        </span>
                      </span>
                    </div>
                    <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          idx === 0
                            ? "bg-gradient-to-r from-indigo-600 to-sky-500"
                            : "bg-indigo-500/80"
                        }`}
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
        <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
              Daftar Kandidat
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 sm:text-sm">
              Pilih kandidat favorit Anda dan berikan dukungan.
            </p>
          </div>
        </div>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {event.candidates.map((cand) => (
            <div
              key={cand.id}
              className="group flex flex-col overflow-hidden rounded-3xl border border-slate-200/90 bg-white shadow-xs transition duration-200 hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-md"
            >
              <div className="relative aspect-[4/3] w-full overflow-hidden bg-slate-100">
                {cand.photoUrl ? (
                  <img
                    src={cand.photoUrl}
                    alt={cand.name}
                    className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-indigo-50 to-slate-200 text-slate-400">
                    <span className="text-4xl font-black">#{cand.number}</span>
                  </div>
                )}
                <span className="absolute left-3.5 top-3.5 rounded-full bg-slate-950/80 px-3 py-1 text-xs font-bold text-white backdrop-blur-md">
                  No. {cand.number}
                </span>
              </div>

              <div className="flex flex-1 flex-col p-5">
                <h3 className="text-lg font-bold text-slate-900">
                  {cand.name}
                </h3>
                {cand.description && (
                  <p className="mt-1.5 line-clamp-3 text-sm leading-relaxed text-slate-600">
                    {cand.description}
                  </p>
                )}

                <div className="mt-auto pt-5">
                  {!event.isBlindMode && (
                    <div className="mb-3 flex items-center justify-between rounded-2xl bg-slate-50 px-3.5 py-2.5 text-xs">
                      <span className="font-medium text-slate-500">
                        Perolehan Suara
                      </span>
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
                      setSupportMessage("");
                      setSelectedCandidate(cand);
                    }}
                    className="flex w-full items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-xs transition hover:bg-indigo-700 active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
                  >
                    <Sparkles className="h-4 w-4" />
                    <span>
                      {votingStatus.canVote
                        ? "Vote Kandidat"
                        : "Voting Ditutup"}
                    </span>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Support Messages Wall */}
      {event.recentMessages.length > 0 && (
        <section className="mt-10">
          <div className="mb-4 flex items-center gap-2">
            <MessageSquareHeart className="h-5 w-5 text-rose-500" />
            <h2 className="text-xl font-bold tracking-tight text-slate-900">
              Pesan Semangat
            </h2>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {event.recentMessages.map((msg) => (
              <article
                key={msg.id}
                className="flex flex-col justify-between rounded-2xl border border-slate-200/90 bg-white p-4 shadow-xs"
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-900">
                      <Heart className="h-3.5 w-3.5 text-rose-500" />
                      {msg.isAnonymous ? "Anonim" : msg.voterName}
                    </span>
                    <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-[11px] font-semibold text-indigo-700">
                      {msg.voteQty} vote
                    </span>
                  </div>
                  <p className="mt-2.5 text-sm leading-relaxed text-slate-700">
                    &ldquo;{msg.supportMessage}&rdquo;
                  </p>
                </div>
                <div className="mt-3 border-t border-slate-100 pt-2.5 text-[11px] font-medium text-slate-500">
                  Untuk No. {msg.candidateNumber} — {msg.candidateName}
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {/* Checkout Modal */}
      {selectedCandidate && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 p-0 backdrop-blur-xs sm:items-center sm:p-4">
          <div className="max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:max-w-md sm:rounded-3xl sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-indigo-600">
                  Checkout Vote
                </span>
                <h3 className="mt-0.5 text-lg font-bold text-slate-900">
                  No. {selectedCandidate.number} — {selectedCandidate.name}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedCandidate(null)}
                className="rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
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
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  {[1, 5, 10, 25].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setVoteQty(preset)}
                      className={`rounded-xl border px-3.5 py-2 text-xs font-semibold transition ${
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
                    className="w-24 rounded-xl border border-slate-300 px-3 py-2 text-center text-sm font-semibold focus:border-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3.5">
                <label className="flex cursor-pointer items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <UserCheck className="h-4 w-4 text-indigo-600" />
                    <div>
                      <div className="text-xs font-semibold text-slate-800">
                        Vote sebagai Anonim
                      </div>
                      <div className="text-[11px] text-slate-500">
                        Nama Anda tampil sebagai &ldquo;Anonim&rdquo;
                      </div>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={isAnonymous}
                    onChange={(e) => setIsAnonymous(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                </label>
              </div>

              {!isAnonymous && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Nama Pemilih
                  </label>
                  <input
                    type="text"
                    required
                    minLength={2}
                    maxLength={120}
                    placeholder="Masukkan nama Anda"
                    value={voterName}
                    onChange={(e) => setVoterName(e.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:border-indigo-500 focus:outline-none"
                  />
                </div>
              )}

              <div>
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold text-slate-700">
                    Kalimat Semangat (Opsional)
                  </label>
                  <span className="text-[11px] text-slate-400">
                    {supportMessage.length}/200
                  </span>
                </div>
                <textarea
                  rows={2}
                  maxLength={200}
                  placeholder="Tulis dukungan singkat untuk kandidat..."
                  value={supportMessage}
                  onChange={(e) => setSupportMessage(e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div className="rounded-2xl bg-indigo-50/70 p-3.5 text-xs text-slate-700">
                <div className="flex items-center justify-between">
                  <span>Total Vote ({voteQty}x)</span>
                  <span className="text-sm font-bold text-slate-900">
                    {formatRupiah(event.pricePerVote * voteQty)}
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-indigo-700">
                  Nominal akan ditambah kode unik 3 digit di halaman QRIS.
                </p>
              </div>

              {errorMsg && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-700">
                  {errorMsg}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-xs transition hover:bg-indigo-700 disabled:bg-indigo-400"
              >
                <CheckCircle2 className="h-4 w-4" />
                <span>
                  {submitting ? "Memproses..." : "Lanjut ke Pembayaran"}
                </span>
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
