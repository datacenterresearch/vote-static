"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, Printer } from "lucide-react";
import { formatDateTimeId, formatRupiah } from "@/lib/format";

export interface PrintCandidateItem {
  id: string;
  number: number;
  name: string;
  description: string | null;
  totalVotes: number;
}

export interface PrintEventItem {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  pricePerVote: number;
  startsAt: string;
  endsAt: string;
  orderCutoffMinutes: number;
  isBlindMode: boolean;
  isActive: boolean;
  candidates: PrintCandidateItem[];
}

export interface PrintEventOption {
  id: string;
  title: string;
  slug: string;
  isActive: boolean;
}

export interface PrintPaidOrderItem {
  id: string;
  voterName: string;
  isAnonymous: boolean;
  supportMessage: string | null;
  voteQty: number;
  baseAmount: number;
  totalAmount: number;
  paidAt: string | null;
  createdAt: string;
  candidate: {
    number: number;
    name: string;
  };
}

export interface PrintSummary {
  totalVotes: number;
  totalCandidateVotes: number;
  ledgerEntries: number;
  totalOrders: number;
  paidOrdersCount: number;
  totalPaidAmount: number;
  totalBaseRevenue: number;
  matchedMutationsCount: number;
  matchedMutationsAmount: number;
  statusCounts: {
    PAID: number;
    PENDING: number;
    EXPIRED: number;
    LATE_PAYMENT: number;
    CANCELLED: number;
  };
}

interface AdminEventPrintClientProps {
  event: PrintEventItem;
  allEvents: PrintEventOption[];
  paidOrders: PrintPaidOrderItem[];
  summary: PrintSummary;
  printedAt: string;
}

function formatNumberId(value: number): string {
  return new Intl.NumberFormat("id-ID").format(value);
}

function formatPercentId(part: number, total: number): string {
  if (total <= 0) return "0,00%";
  return `${new Intl.NumberFormat("id-ID", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format((part / total) * 100)}%`;
}

export default function AdminEventPrintClient({
  event,
  allEvents,
  paidOrders,
  summary,
  printedAt,
}: AdminEventPrintClientProps) {
  const router = useRouter();
  const [showTransactions, setShowTransactions] = useState(true);
  const [showMessages, setShowMessages] = useState(true);
  const [showSignatures, setShowSignatures] = useState(true);

  const totalVotesForShare = summary.totalCandidateVotes;

  return (
    <div className="min-h-screen bg-slate-100 pb-12 print:min-h-0 print:bg-white print:pb-0">
      {/* Control Bar (Hidden when printing) */}
      <div className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur-md print:hidden">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/admin"
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Kembali ke Dashboard</span>
            </Link>

            <div className="flex items-center gap-2">
              <label
                htmlFor="print-event-switcher"
                className="text-xs font-semibold text-slate-600"
              >
                Pilih Event:
              </label>
              <select
                id="print-event-switcher"
                value={event.id}
                onChange={(e) =>
                  router.push(`/admin/events/${e.target.value}/print`)
                }
                className="max-w-xs rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 focus:border-cyan-600 focus:outline-none"
              >
                {allEvents.map((ev) => (
                  <option key={ev.id} value={ev.id}>
                    {ev.title} ({ev.slug}){ev.isActive ? "" : " [Nonaktif]"}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <label className="flex cursor-pointer items-center gap-1.5 text-xs font-medium text-slate-700">
              <input
                type="checkbox"
                checked={showTransactions}
                onChange={(e) => setShowTransactions(e.target.checked)}
              />
              <span>Rincian Transaksi</span>
            </label>
            <label className="flex cursor-pointer items-center gap-1.5 text-xs font-medium text-slate-700">
              <input
                type="checkbox"
                checked={showMessages}
                disabled={!showTransactions}
                onChange={(e) => setShowMessages(e.target.checked)}
              />
              <span className={!showTransactions ? "text-slate-400" : ""}>
                Pesan Dukungan
              </span>
            </label>
            <label className="flex cursor-pointer items-center gap-1.5 text-xs font-medium text-slate-700">
              <input
                type="checkbox"
                checked={showSignatures}
                onChange={(e) => setShowSignatures(e.target.checked)}
              />
              <span>Kolom Pengesahan</span>
            </label>

            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#1C3458] to-[#0E7490] px-4 py-2 text-xs font-semibold text-white shadow-xs transition hover:from-[#152845] hover:to-[#0891B2]"
            >
              <Printer className="h-3.5 w-3.5" />
              <span>Cetak / Simpan PDF</span>
            </button>
          </div>
        </div>
      </div>

      {/* Printable A4 Sheet */}
      <div className="mx-auto mt-6 max-w-4xl px-4 print:mt-0 print:max-w-none print:px-0">
        <article className="mx-auto max-w-4xl rounded-2xl border border-slate-200 bg-white p-8 shadow-sm print:max-w-none print:rounded-none print:border-0 print:p-0 print:shadow-none">
          {/* Kop / Header Dokumen */}
          <header className="border-b-2 border-slate-900 pb-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-start gap-3.5">
                <div className="h-12 w-12 shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-[#1C3458]">
                  <img
                    src="/images/logo-icon.png"
                    alt="Logo Votingin"
                    className="h-full w-full object-cover"
                  />
                </div>
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-cyan-800">
                    DOKUMEN REKAPITULASI EVENT VOTING
                  </p>
                  <h1 className="mt-1 text-2xl font-bold text-slate-900">
                    {event.title}
                  </h1>
                  <p className="mt-0.5 font-mono text-xs text-slate-500">
                    /events/{event.slug}
                  </p>
                  {event.description && (
                    <p className="mt-2 max-w-2xl text-xs leading-relaxed text-slate-600">
                      {event.description}
                    </p>
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-right text-[11px]">
                <div className="font-semibold text-slate-500">Status Event</div>
                <div
                  className={`mt-0.5 font-bold ${
                    event.isActive ? "text-emerald-700" : "text-slate-700"
                  }`}
                >
                  {event.isActive ? "AKTIF" : "NONAKTIF"}
                </div>
                <div className="mt-1 text-slate-500">
                  Mode:{" "}
                  <span className="font-semibold text-slate-800">
                    {event.isBlindMode ? "Blind Mode" : "Terbuka"}
                  </span>
                </div>
              </div>
            </div>

            <dl className="mt-4 grid gap-2 rounded-xl border border-slate-200 bg-slate-50/70 p-3 text-xs sm:grid-cols-4">
              <div>
                <dt className="text-[11px] text-slate-500">Periode Mulai</dt>
                <dd className="mt-0.5 font-semibold text-slate-900">
                  {formatDateTimeId(event.startsAt)}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] text-slate-500">Periode Selesai</dt>
                <dd className="mt-0.5 font-semibold text-slate-900">
                  {formatDateTimeId(event.endsAt)}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] text-slate-500">Harga per Vote</dt>
                <dd className="mt-0.5 font-semibold text-slate-900">
                  {formatRupiah(event.pricePerVote)}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] text-slate-500">Waktu Cetak</dt>
                <dd className="mt-0.5 font-semibold text-slate-900">
                  {formatDateTimeId(printedAt)}
                </dd>
              </div>
            </dl>
          </header>

          {/* Ringkasan Eksekutif */}
          <section className="mt-6">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700">
              Ringkasan Eksekutif
            </h2>
            <div className="mt-2.5 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-xl border border-slate-200 p-3.5">
                <div className="text-[11px] font-medium text-slate-500">
                  Total Suara Sah
                </div>
                <div className="mt-1 text-xl font-bold text-[#1C3458]">
                  {formatNumberId(summary.totalVotes)}
                </div>
                <div className="mt-0.5 text-[11px] text-slate-500">
                  {formatNumberId(summary.ledgerEntries)} entri ledger
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 p-3.5">
                <div className="text-[11px] font-medium text-slate-500">
                  Total Dana Masuk
                </div>
                <div className="mt-1 text-xl font-bold text-slate-900">
                  {formatRupiah(summary.totalPaidAmount)}
                </div>
                <div className="mt-0.5 text-[11px] text-slate-500">
                  Dari {formatNumberId(summary.paidOrdersCount)} transaksi lunas
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 p-3.5">
                <div className="text-[11px] font-medium text-slate-500">
                  Status Order
                </div>
                <div className="mt-1 text-xl font-bold text-emerald-700">
                  {formatNumberId(summary.paidOrdersCount)} PAID
                </div>
                <div className="mt-0.5 text-[11px] text-slate-500">
                  Dari {formatNumberId(summary.totalOrders)} order •{" "}
                  {formatNumberId(summary.matchedMutationsCount)} mutasi cocok
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 p-3.5">
                <div className="text-[11px] font-medium text-slate-500">
                  Total Kandidat
                </div>
                <div className="mt-1 text-xl font-bold text-slate-900">
                  {formatNumberId(event.candidates.length)}
                </div>
                <div className="mt-0.5 text-[11px] text-slate-500">
                  Pending: {summary.statusCounts.PENDING} • Expired:{" "}
                  {summary.statusCounts.EXPIRED}
                </div>
              </div>
            </div>
          </section>

          {/* Tabel Perolehan Suara Kandidat */}
          <section className="mt-7">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700">
              Perolehan Suara Kandidat
            </h2>
            <div className="mt-2.5 overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-[11px] uppercase text-slate-600">
                  <tr className="border-b border-slate-200">
                    <th className="px-3 py-2.5">Peringkat</th>
                    <th className="px-3 py-2.5">No. Urut</th>
                    <th className="px-3 py-2.5">Nama Kandidat</th>
                    <th className="px-3 py-2.5 text-right">Suara Sah</th>
                    <th className="px-3 py-2.5 text-right">Persentase</th>
                    <th className="px-3 py-2.5 text-right">
                      Estimasi Nominal
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {event.candidates.map((c, idx) => (
                    <tr key={c.id}>
                      <td className="px-3 py-2.5 font-semibold text-slate-700">
                        #{idx + 1}
                      </td>
                      <td className="px-3 py-2.5 font-mono font-semibold text-slate-800">
                        No. {c.number}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="font-semibold text-slate-900">
                          {c.name}
                        </div>
                        {c.description && (
                          <div className="mt-0.5 text-[11px] text-slate-500">
                            {c.description}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono font-bold text-slate-900">
                        {formatNumberId(c.totalVotes)}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-slate-700">
                        {formatPercentId(c.totalVotes, totalVotesForShare)}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-slate-800">
                        {formatRupiah(c.totalVotes * event.pricePerVote)}
                      </td>
                    </tr>
                  ))}
                  {event.candidates.length === 0 && (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-3 py-6 text-center text-slate-500"
                      >
                        Belum ada kandidat terdaftar pada event ini.
                      </td>
                    </tr>
                  )}
                </tbody>
                {event.candidates.length > 0 && (
                  <tfoot className="border-t-2 border-slate-200 bg-slate-50 font-bold text-slate-900">
                    <tr>
                      <td colSpan={3} className="px-3 py-2.5">
                        Total Keseluruhan
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono">
                        {formatNumberId(summary.totalCandidateVotes)}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono">
                        {summary.totalCandidateVotes > 0 ? "100,00%" : "0,00%"}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono">
                        {formatRupiah(
                          summary.totalCandidateVotes * event.pricePerVote
                        )}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </section>

          {/* Tabel Rincian Transaksi Lunas */}
          {showTransactions && (
            <section className="mt-7">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  Rincian Transaksi Lunas (PAID) — {paidOrders.length} Transaksi
                </h2>
              </div>
              <div className="mt-2.5 overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-left text-[11px]">
                  <thead className="bg-slate-50 uppercase text-slate-600">
                    <tr className="border-b border-slate-200">
                      <th className="px-2.5 py-2">No</th>
                      <th className="px-2.5 py-2">Waktu Bayar</th>
                      <th className="px-2.5 py-2">Pemilih</th>
                      <th className="px-2.5 py-2">Kandidat</th>
                      <th className="px-2.5 py-2 text-right">Qty</th>
                      <th className="px-2.5 py-2 text-right">Total</th>
                      {showMessages && (
                        <th className="px-2.5 py-2">Pesan Dukungan</th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {paidOrders.map((o, idx) => (
                      <tr key={o.id}>
                        <td className="px-2.5 py-2 text-slate-500">
                          {idx + 1}
                        </td>
                        <td className="px-2.5 py-2 whitespace-nowrap text-slate-600">
                          {formatDateTimeId(o.paidAt ?? o.createdAt)}
                        </td>
                        <td className="px-2.5 py-2 font-semibold text-slate-900">
                          {o.isAnonymous ? "Anonim" : o.voterName}
                        </td>
                        <td className="px-2.5 py-2 text-slate-700">
                          No. {o.candidate.number} {o.candidate.name}
                        </td>
                        <td className="px-2.5 py-2 text-right font-mono font-semibold">
                          {formatNumberId(o.voteQty)}
                        </td>
                        <td className="px-2.5 py-2 text-right font-mono font-bold text-slate-900">
                          {formatRupiah(o.totalAmount)}
                        </td>
                        {showMessages && (
                          <td className="max-w-[180px] px-2.5 py-2 text-slate-600">
                            {o.supportMessage ? (
                              <span className="italic">
                                &ldquo;{o.supportMessage}&rdquo;
                              </span>
                            ) : (
                              "-"
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                    {paidOrders.length === 0 && (
                      <tr>
                        <td
                          colSpan={showMessages ? 7 : 6}
                          className="px-3 py-6 text-center text-slate-500"
                        >
                          Belum ada transaksi berstatus PAID pada event ini.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* Kolom Pengesahan */}
          {showSignatures && (
            <section className="mt-10 break-inside-avoid">
              <div className="grid gap-8 sm:grid-cols-2">
                <div className="text-center text-xs">
                  <p className="text-slate-600">Mengetahui,</p>
                  <p className="mt-0.5 font-bold text-slate-900">
                    Panitia Pelaksana
                  </p>
                  <div className="mt-16 border-b border-slate-400" />
                  <p className="mt-1.5 text-[11px] text-slate-500">
                    Nama &amp; Tanda Tangan
                  </p>
                </div>

                <div className="text-center text-xs">
                  <p className="text-slate-600">
                    Dicetak pada {formatDateTimeId(printedAt)}
                  </p>
                  <p className="mt-0.5 font-bold text-slate-900">
                    Admin / Saksi Verifikasi
                  </p>
                  <div className="mt-16 border-b border-slate-400" />
                  <p className="mt-1.5 text-[11px] text-slate-500">
                    Nama &amp; Tanda Tangan
                  </p>
                </div>
              </div>
            </section>
          )}

          {/* Footer Dokumen */}
          <footer className="mt-8 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-3 text-[10px] text-slate-500">
            <span className="font-mono">Event ID: {event.id}</span>
            <span>Dicetak pada: {formatDateTimeId(printedAt)}</span>
          </footer>
        </article>
      </div>
    </div>
  );
}
