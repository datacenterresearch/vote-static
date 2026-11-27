"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  FileUp,
  Heart,
  QrCode,
  RefreshCw,
  XCircle,
} from "lucide-react";
import { formatDateTimeId, formatRupiah } from "@/lib/format";

export interface PayOrderDetail {
  id: string;
  status: "PENDING" | "PAID" | "EXPIRED" | "LATE_PAYMENT" | "CANCELLED";
  voterName: string;
  isAnonymous: boolean;
  supportMessage: string | null;
  voteQty: number;
  baseAmount: number;
  totalAmount: number;
  expiresAt: string;
  paidAt: string | null;
  createdAt: string;
  serverNow: string;
  event: {
    id: string;
    slug: string;
    title: string;
    pricePerVote: number;
    qrisImageUrl: string | null;
  };
  candidate: {
    id: string;
    number: number;
    name: string;
    photoUrl: string | null;
  };
  dynamicQrisDataUrl: string | null;
  dynamicQrisPayload: string | null;
  latestProof: {
    id: string;
    status: "PENDING_REVIEW" | "APPROVED" | "REJECTED";
    rrnInput: string | null;
    createdAt: string;
    imageUrl: string;
  } | null;
}

export default function PayOrderClient({
  initialOrder,
}: {
  initialOrder: PayOrderDetail;
}) {
  const [order, setOrder] = useState<PayOrderDetail>(initialOrder);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [clockOffsetMs, setClockOffsetMs] = useState<number>(
    () => new Date(initialOrder.serverNow).getTime() - Date.now()
  );
  const [useStaticFallback, setUseStaticFallback] = useState(
    !initialOrder.dynamicQrisDataUrl
  );
  const [qrImageError, setQrImageError] = useState(false);
  const [qrRetryNonce, setQrRetryNonce] = useState(0);
  const [copied, setCopied] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const [proofFile, setProofFile] = useState<File | null>(null);
  const [rrnInput, setRrnInput] = useState("");
  const [uploadingProof, setUploadingProof] = useState(false);
  const [proofFeedback, setProofFeedback] = useState<{
    type: "ok" | "err";
    text: string;
  } | null>(null);

  const fetchOrder = useCallback(async () => {
    try {
      const res = await fetch(`/api/orders/${order.id}`, { cache: "no-store" });
      if (res.ok) {
        const data = (await res.json()) as { order: PayOrderDetail };
        setOrder(data.order);
        if (data.order.serverNow) {
          setClockOffsetMs(
            new Date(data.order.serverNow).getTime() - Date.now()
          );
        }
      }
    } catch {
      // ignore transient network errors during polling
    }
  }, [order.id]);

  // 1s countdown clock
  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // 3s status polling while PENDING or LATE_PAYMENT
  useEffect(() => {
    if (order.status === "PAID" || order.status === "CANCELLED") {
      return;
    }
    const poller = setInterval(fetchOrder, 3000);
    return () => clearInterval(poller);
  }, [order.status, fetchOrder]);

  useEffect(() => {
    if (!order.dynamicQrisDataUrl) {
      setUseStaticFallback(true);
    }
  }, [order.dynamicQrisDataUrl]);

  const activeQrImage =
    !useStaticFallback && order.dynamicQrisDataUrl
      ? order.dynamicQrisDataUrl
      : order.event.qrisImageUrl;

  const activeQrImageSrc =
    activeQrImage &&
    activeQrImage.startsWith("/api/files/") &&
    qrRetryNonce > 0
      ? `${activeQrImage}?r=${qrRetryNonce}`
      : activeQrImage;

  useEffect(() => {
    setQrImageError(false);
  }, [activeQrImage]);

  const effectiveNowMs = nowMs + clockOffsetMs;
  const expiresMs = new Date(order.expiresAt).getTime();
  const remainingMs = Math.max(0, expiresMs - effectiveNowMs);
  const remainingMin = Math.floor(remainingMs / 60000);
  const remainingSec = Math.floor((remainingMs % 60000) / 1000);

  const displayVoterName = order.isAnonymous ? "Anonim" : order.voterName;

  async function handleCopyAmount() {
    try {
      await navigator.clipboard.writeText(String(order.totalAmount));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore clipboard restrictions
    }
  }

  async function handleCancelOrder() {
    setCancelling(true);
    try {
      const sessionKey =
        typeof window !== "undefined"
          ? window.localStorage.getItem("vote_qris_session_key") ?? ""
          : "";
      const res = await fetch(`/api/orders/${order.id}`, {
        method: "DELETE",
        headers: sessionKey ? { "x-session-key": sessionKey } : {},
      });
      if (res.ok) {
        await fetchOrder();
      }
    } finally {
      setCancelling(false);
    }
  }

  async function handleProofSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!proofFile) return;

    setUploadingProof(true);
    setProofFeedback(null);
    try {
      const formData = new FormData();
      formData.append("file", proofFile);
      if (rrnInput.trim()) {
        formData.append("rrnInput", rrnInput.trim());
      }

      const res = await fetch(`/api/orders/${order.id}/proof`, {
        method: "POST",
        body: formData,
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setProofFeedback({
          type: "err",
          text: data.error ?? "Gagal mengunggah bukti pembayaran.",
        });
        return;
      }

      setProofFeedback({
        type: "ok",
        text: "Bukti pembayaran terkirim dan menunggu verifikasi panitia.",
      });
      setProofFile(null);
      setRrnInput("");
      await fetchOrder();
    } catch {
      setProofFeedback({
        type: "err",
        text: "Terjadi kesalahan jaringan saat mengunggah bukti.",
      });
    } finally {
      setUploadingProof(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
        <Link
          href={`/events/${order.event.slug}`}
          className="inline-flex items-center gap-1.5 rounded-xl bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs ring-1 ring-slate-200 transition hover:bg-slate-50 hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Kembali ke Event</span>
        </Link>
        <span className="rounded-lg bg-white px-2.5 py-1 font-mono text-[11px] text-slate-500 ring-1 ring-slate-200">
          #{order.id.slice(0, 10)}
        </span>
      </div>

      {/* PAID Success Banner */}
      {order.status === "PAID" && (
        <div className="rounded-3xl border border-emerald-200 bg-white p-6 text-center shadow-sm sm:p-8">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
            <CheckCircle2 className="h-9 w-9" />
          </div>
          <h1 className="mt-4 text-2xl font-bold text-slate-900">
            Vote Berhasil Diterima!
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            Terima kasih, <strong>{displayVoterName}</strong>. Pembayaran{" "}
            <strong>{formatRupiah(order.totalAmount)}</strong> telah diterima
            dan <strong>{order.voteQty} suara</strong> untuk{" "}
            <strong>
              No. {order.candidate.number} {order.candidate.name}
            </strong>{" "}
            sudah tercatat.
          </p>

          {order.supportMessage && (
            <div className="mx-auto mt-4 max-w-md rounded-2xl border border-rose-100 bg-rose-50/70 px-4 py-3 text-left text-xs text-slate-700">
              <div className="flex items-center gap-1.5 font-semibold text-rose-700">
                <Heart className="h-3.5 w-3.5" />
                <span>Pesan Semangat</span>
              </div>
              <p className="mt-1 italic text-slate-700">
                &ldquo;{order.supportMessage}&rdquo;
              </p>
            </div>
          )}

          {order.paidAt && (
            <p className="mt-3 text-xs text-slate-500">
              Diverifikasi pada {formatDateTimeId(order.paidAt)}
            </p>
          )}
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link
              href={`/events/${order.event.slug}`}
              className="rounded-2xl bg-gradient-to-r from-[#1C3458] to-[#0E7490] px-5 py-2.5 text-sm font-semibold text-white shadow-xs transition hover:from-[#152845] hover:to-[#0891B2]"
            >
              Lihat Hasil Sementara
            </Link>
          </div>
        </div>
      )}

      {/* CANCELLED, EXPIRED, or LATE_PAYMENT state */}
      {(order.status === "CANCELLED" ||
        order.status === "EXPIRED" ||
        order.status === "LATE_PAYMENT") && (
        <div className="mb-6 rounded-3xl border border-amber-200 bg-amber-50 p-5 shadow-xs sm:p-6">
          <div className="flex items-start gap-3">
            {order.status === "CANCELLED" ? (
              <XCircle className="mt-0.5 h-6 w-6 shrink-0 text-rose-600" />
            ) : (
              <AlertTriangle className="mt-0.5 h-6 w-6 shrink-0 text-amber-600" />
            )}
            <div>
              <h2 className="text-base font-bold text-slate-900">
                {order.status === "CANCELLED"
                  ? "Pesanan Dibatalkan"
                  : order.status === "LATE_PAYMENT"
                  ? "Pembayaran Terlambat Terdeteksi"
                  : "Waktu Pembayaran Habis"}
              </h2>
              <p className="mt-1 text-xs leading-relaxed text-slate-700 sm:text-sm">
                {order.status === "CANCELLED"
                  ? "Pesanan ini telah dibatalkan. Silakan buat pesanan baru untuk memberikan suara."
                  : "Batas waktu pembayaran telah berakhir. Jika Anda sudah transfer, unggah bukti pembayaran di bawah untuk dibantu verifikasi oleh panitia."}
              </p>
              <div className="mt-3">
                <Link
                  href={`/events/${order.event.slug}`}
                  className="inline-flex items-center rounded-xl bg-[#1C3458] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[#152845]"
                >
                  Buat Pesanan Baru
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Payment Card when PENDING */}
      {order.status === "PENDING" && (
        <div className="overflow-hidden rounded-3xl border border-slate-200/90 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-[#1C3458] px-5 py-3.5 text-white sm:px-6">
            <div className="flex items-center gap-2 text-xs font-semibold">
              <RefreshCw className="h-3.5 w-3.5 animate-spin text-emerald-400" />
              <span>Menunggu Pembayaran</span>
            </div>
            <div
              suppressHydrationWarning
              className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 font-mono text-xs font-bold text-amber-300"
            >
              <Clock className="h-3.5 w-3.5" />
              <span>
                {String(remainingMin).padStart(2, "0")}:
                {String(remainingSec).padStart(2, "0")}
              </span>
            </div>
          </div>

          <div className="p-5 sm:p-8">
            <div className="rounded-2xl border border-cyan-100 bg-gradient-to-br from-cyan-50/90 to-teal-50/70 p-4 text-center sm:p-5">
              <div className="text-xs font-bold uppercase tracking-wider text-cyan-800">
                Total Pembayaran
              </div>
              <div className="mt-2.5 flex flex-wrap items-center justify-center gap-3">
                <div className="font-mono text-3xl font-black tracking-tight text-slate-900 sm:text-4xl">
                  {formatRupiah(order.totalAmount)}
                </div>
                <button
                  type="button"
                  onClick={handleCopyAmount}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-cyan-200 bg-white px-3.5 py-2 text-xs font-semibold text-cyan-800 shadow-2xs transition hover:bg-cyan-50"
                >
                  {copied ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-emerald-600" />
                      <span>Tersalin</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" />
                      <span>Salin</span>
                    </>
                  )}
                </button>
              </div>
              <div className="mt-2 text-xs text-slate-600">
                {order.voteQty} vote ×{" "}
                <strong className="text-slate-900">
                  {formatRupiah(order.event.pricePerVote)}
                </strong>
              </div>
            </div>

            {/* QRIS Code Section */}
            <div className="mt-6 flex flex-col items-center">
              {activeQrImageSrc && !qrImageError ? (
                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
                  <img
                    src={activeQrImageSrc}
                    alt="QRIS Pembayaran Vote"
                    onError={() => {
                      if (useStaticFallback && order.dynamicQrisDataUrl) {
                        setUseStaticFallback(false);
                      } else {
                        setQrImageError(true);
                      }
                    }}
                    className="h-60 w-60 object-contain sm:h-64 sm:w-64"
                  />
                </div>
              ) : qrImageError ? (
                <div className="flex h-60 w-60 flex-col items-center justify-center rounded-2xl border border-dashed border-amber-300 bg-amber-50/80 p-5 text-center text-xs text-amber-900 sm:h-64 sm:w-64">
                  <AlertTriangle className="mb-2 h-8 w-8 text-amber-600" />
                  <span>
                    Gambar QRIS gagal dimuat. Periksa koneksi internet atau coba
                    muat ulang.
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setQrImageError(false);
                      setQrRetryNonce((n) => n + 1);
                      void fetchOrder();
                    }}
                    className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-[#1C3458] px-3 py-1.5 text-[11px] font-semibold text-white transition hover:bg-[#152845]"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    <span>Muat Ulang QRIS</span>
                  </button>
                </div>
              ) : (
                <div className="flex h-60 w-60 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-xs text-slate-500 sm:h-64 sm:w-64">
                  <QrCode className="mb-2 h-8 w-8 text-slate-400" />
                  <span>
                    Gambar QRIS belum tersedia. Silakan hubungi panitia.
                  </span>
                </div>
              )}

              {order.dynamicQrisDataUrl && order.event.qrisImageUrl && (
                <button
                  type="button"
                  onClick={() => setUseStaticFallback((prev) => !prev)}
                  className="mt-3 text-xs font-semibold text-cyan-700 underline-offset-2 hover:underline"
                >
                  {useStaticFallback
                    ? "Gunakan QRIS Nominal Otomatis"
                    : "Gagal scan? Gunakan gambar QRIS statis"}
                </button>
              )}

              <p className="mt-3 max-w-md text-center text-xs leading-relaxed text-slate-500">
                {useStaticFallback || !order.dynamicQrisDataUrl
                  ? "Scan QRIS di atas dengan aplikasi bank atau e-wallet, lalu masukkan nominal pembayaran sesuai total di atas."
                  : "Scan QRIS di atas menggunakan aplikasi bank atau e-wallet Anda."}
              </p>
            </div>

            {/* Order Summary */}
            <div className="mt-6 space-y-2 rounded-2xl bg-slate-50 p-4 text-xs text-slate-600">
              <div className="flex items-start justify-between gap-3">
                <span>Event</span>
                <span className="text-right font-semibold text-slate-900">
                  {order.event.title}
                </span>
              </div>
              <div className="flex items-start justify-between gap-3">
                <span>Kandidat</span>
                <span className="text-right font-semibold text-slate-900">
                  No. {order.candidate.number} — {order.candidate.name}
                </span>
              </div>
              <div className="flex items-start justify-between gap-3">
                <span>Pemilih</span>
                <span className="text-right font-semibold text-slate-900">
                  {displayVoterName} ({order.voteQty} vote)
                </span>
              </div>
              {order.supportMessage && (
                <div className="border-t border-slate-200/70 pt-2">
                  <span className="block text-slate-500">Pesan Semangat</span>
                  <p className="mt-0.5 italic text-slate-800">
                    &ldquo;{order.supportMessage}&rdquo;
                  </p>
                </div>
              )}
            </div>

            <div className="mt-5 flex justify-end">
              <button
                type="button"
                disabled={cancelling}
                onClick={handleCancelOrder}
                className="text-xs font-semibold text-rose-600 transition hover:text-rose-700 disabled:opacity-50"
              >
                {cancelling ? "Membatalkan..." : "Batalkan Pesanan"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manual Proof Upload Section */}
      {order.status !== "PAID" && order.status !== "CANCELLED" && (
        <div className="mt-6 rounded-3xl border border-slate-200/90 bg-white p-5 shadow-xs sm:p-6">
          <div className="flex items-center gap-2">
            <FileUp className="h-5 w-5 text-cyan-700" />
            <h2 className="text-base font-bold text-slate-900">
              Unggah Bukti Pembayaran
            </h2>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-slate-600">
            Jika sudah transfer namun status belum berubah, unggah tangkapan
            layar bukti bayar Anda di sini.
          </p>

          {order.latestProof && (
            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3.5 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-slate-700">
                  Status Bukti Terakhir
                </span>
                <span
                  className={`rounded-full px-2.5 py-0.5 font-semibold ${
                    order.latestProof.status === "APPROVED"
                      ? "bg-emerald-100 text-emerald-700"
                      : order.latestProof.status === "REJECTED"
                      ? "bg-rose-100 text-rose-700"
                      : "bg-amber-100 text-amber-800"
                  }`}
                >
                  {order.latestProof.status}
                </span>
              </div>
              {order.latestProof.rrnInput && (
                <div className="mt-1 text-slate-600">
                  Referensi: {order.latestProof.rrnInput}
                </div>
              )}
            </div>
          )}

          <form onSubmit={handleProofSubmit} className="mt-4 space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700">
                Gambar Bukti Transfer (PNG, JPG, WEBP maks 5MB)
              </label>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                required
                onChange={(e) => setProofFile(e.target.files?.[0] ?? null)}
                className="mt-1.5 block w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-700 file:mr-3 file:rounded-lg file:border-0 file:bg-cyan-50 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-cyan-800"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700">
                Nomor Referensi (Opsional)
              </label>
              <input
                type="text"
                placeholder="Masukkan nomor referensi transfer"
                value={rrnInput}
                onChange={(e) => setRrnInput(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2 text-xs focus:border-cyan-600 focus:outline-none"
              />
            </div>

            {proofFeedback && (
              <div
                className={`rounded-xl px-3.5 py-2.5 text-xs font-medium ${
                  proofFeedback.type === "ok"
                    ? "border border-emerald-200 bg-emerald-50 text-emerald-800"
                    : "border border-rose-200 bg-rose-50 text-rose-700"
                }`}
              >
                {proofFeedback.text}
              </div>
            )}

            <button
              type="submit"
              disabled={uploadingProof || !proofFile}
              className="inline-flex items-center gap-2 rounded-xl bg-[#1C3458] px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-[#152845] disabled:bg-slate-300"
            >
              <FileUp className="h-4 w-4" />
              <span>
                {uploadingProof ? "Mengunggah..." : "Kirim Bukti Pembayaran"}
              </span>
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
