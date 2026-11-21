import Link from "next/link";
import {
  ArrowRight,
  Calendar,
  ChevronDown,
  Clock,
  Eye,
  Heart,
  HelpCircle,
  QrCode,
  ShieldCheck,
} from "lucide-react";
import { prisma } from "@/lib/prisma";
import { formatDateTimeId, formatRupiah } from "@/lib/format";

export const dynamic = "force-dynamic";

const PROFILE_FEATURES = [
  {
    icon: QrCode,
    title: "QRIS",
    desc: "Mendukung pembayaran dari berbagai aplikasi dompet digital dan bank di Indonesia.",
  },
  {
    icon: Eye,
    title: "Transparan & Real-Time",
    desc: "Perolehan suara diperbarui langsung saat transaksi berhasil diverifikasi.",
  },
  {
    icon: ShieldCheck,
    title: "Privasi Terjaga",
    desc: "Pemilih tidak diminta nomor HP ataupun kata sandi, serta dapat memilih mode Anonim.",
  },
  {
    icon: Heart,
    title: "Pesan Semangat",
    desc: "Sampaikan kalimat dukungan singkat yang tampil di halaman event setelah pembayaran lunas.",
  },
];

const VOTE_STEPS = [
  {
    step: "01",
    title: "Pilih Event & Kandidat",
    desc: "Buka halaman event yang ingin Anda ikuti, lalu pilih kandidat favorit Anda.",
  },
  {
    step: "02",
    title: "Isi Nama atau Anonim",
    desc: "Tentukan jumlah vote, masukkan nama atau centang Anonim, dan tambahkan pesan semangat jika ingin.",
  },
  {
    step: "03",
    title: "Bayar via QRIS",
    desc: "Scan kode QRIS yang muncul dan pastikan nominal transfer tepat hingga 3 digit kode unik.",
  },
  {
    step: "04",
    title: "Suara Tercatat Otomatis",
    desc: "Tunggu beberapa detik hingga status lunas dan dukungan Anda langsung masuk ke perolehan suara.",
  },
];

const FAQS = [
  {
    q: "Apakah harus membuat akun atau memasukkan nomor HP?",
    a: "Tidak. Anda bisa langsung memilih kandidat, mengisi nama atau memilih opsi Anonim, lalu melakukan pembayaran QRIS.",
  },
  {
    q: "Mengapa ada 3 digit angka tambahan pada total pembayaran?",
    a: "Tiga digit kode unik tersebut membantu sistem mengenali pembayaran Anda secara otomatis tanpa perlu menunggu konfirmasi manual.",
  },
  {
    q: "Aplikasi pembayaran apa saja yang didukung?",
    a: "Semua aplikasi mobile banking dan e-wallet yang mendukung QRIS, seperti BCA, BRI, Mandiri, BNI, GoPay, OVO, DANA, ShopeePay, dan lainnya.",
  },
  {
    q: "Bagaimana jika sudah transfer tetapi status belum berubah?",
    a: "Anda dapat mengunggah screenshot bukti transfer langsung di halaman pembayaran agar panitia bisa membantu verifikasi.",
  },
];

export default async function HomePage() {
  let events: Array<{
    id: string;
    slug: string;
    title: string;
    description: string | null;
    pricePerVote: number;
    startsAt: Date;
    endsAt: Date;
    _count: {
      candidates: number;
    };
  }> = [];

  let dbError = false;
  try {
    events = await prisma.event.findMany({
      where: { isActive: true },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        slug: true,
        title: true,
        description: true,
        pricePerVote: true,
        startsAt: true,
        endsAt: true,
        _count: {
          select: { candidates: true },
        },
      },
    });
  } catch {
    dbError = true;
  }

  const now = new Date();

  function getEventStatus(startsAt: Date, endsAt: Date) {
    if (now < startsAt) {
      return {
        label: "Akan Datang",
        badgeClass: "bg-amber-100 text-amber-800 ring-1 ring-amber-200",
        dotClass: "bg-amber-500",
      };
    }
    if (now >= endsAt) {
      return {
        label: "Selesai",
        badgeClass: "bg-slate-100 text-slate-600 ring-1 ring-slate-200",
        dotClass: "bg-slate-400",
      };
    }
    return {
      label: "Sedang Berlangsung",
      badgeClass: "bg-emerald-100 text-emerald-800 ring-1 ring-emerald-200",
      dotClass: "bg-emerald-500 animate-pulse",
    };
  }

  return (
    <div className="flex min-h-screen flex-col">
      {/* Sticky Navbar */}
      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3.5 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="h-9 w-9 overflow-hidden rounded-xl border border-slate-200/80 bg-[#1C3458] shadow-xs">
              <img
                src="/images/logo-icon.png"
                alt="Logo Votingin"
                className="h-full w-full object-cover"
              />
            </div>
            <div>
              <div className="text-sm font-bold tracking-tight text-slate-900">
                Votingin
              </div>
            </div>
          </Link>

          <nav
            aria-label="Navigasi utama"
            className="hidden items-center gap-6 text-xs font-semibold text-slate-600 md:flex"
          >
            <a href="#event" className="transition hover:text-cyan-700">
              Event Aktif
            </a>
            <a href="#profil" className="transition hover:text-cyan-700">
              Profil
            </a>
            <a href="#cara-vote" className="transition hover:text-cyan-700">
              Cara Vote
            </a>
            <a href="#faq" className="transition hover:text-cyan-700">
              FAQ
            </a>
          </nav>

          <Link
            href="/admin"
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-2xs transition hover:border-cyan-200 hover:bg-slate-50"
          >
            <ShieldCheck className="h-4 w-4 text-cyan-700" />
            <span>Admin</span>
          </Link>
        </div>
      </header>

      <main className="flex-1">
        {/* Active Events Section */}
        <section
          id="event"
          className="mx-auto max-w-6xl scroll-mt-20 px-4 pt-8 sm:px-6 sm:pt-10 lg:px-8"
        >
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
                Event Voting Aktif
              </h1>
              <p className="mt-1 text-sm text-slate-600">
                Pilih event di bawah ini untuk membuka halaman voting dan
                melihat daftar kandidat.
              </p>
            </div>
            {!dbError && events.length > 0 && (
              <span className="rounded-full bg-cyan-50 px-3 py-1 text-xs font-semibold text-cyan-800">
                {events.length} Event Tersedia
              </span>
            )}
          </div>

          {dbError ? (
            <div className="mt-6 rounded-3xl border border-amber-200 bg-amber-50 p-6 text-center shadow-2xs sm:p-8">
              <h3 className="text-base font-bold text-amber-900">
                Daftar Event Sedang Disiapkan
              </h3>
              <p className="mt-1.5 text-sm text-amber-800">
                Koneksi database belum tersedia saat ini. Silakan muat ulang
                halaman beberapa saat lagi.
              </p>
            </div>
          ) : events.length === 0 ? (
            <div className="mt-6 rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-xs sm:p-10">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-50 text-cyan-700">
                <QrCode className="h-6 w-6" />
              </div>
              <h3 className="mt-4 text-lg font-bold text-slate-900">
                Belum Ada Event Aktif Saat Ini
              </h3>
              <p className="mx-auto mt-1.5 max-w-md text-sm text-slate-600">
                Event baru akan tampil di halaman ini setelah diaktifkan oleh
                panitia melalui panel Admin.
              </p>
              <Link
                href="/admin"
                className="mt-5 inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-[#1C3458] to-[#0E7490] px-5 py-2.5 text-xs font-semibold text-white transition hover:from-[#152845] hover:to-[#0891B2]"
              >
                <span>Buka Panel Admin</span>
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          ) : events.length === 1 ? (
            <div className="mt-6">
              {(() => {
                const ev = events[0];
                const status = getEventStatus(ev.startsAt, ev.endsAt);
                return (
                  <Link
                    href={`/events/${ev.slug}`}
                    className="group flex flex-col justify-between gap-6 rounded-3xl border border-slate-200/90 bg-white p-6 shadow-xs transition hover:-translate-y-0.5 hover:border-cyan-300 hover:shadow-md sm:p-8 lg:flex-row lg:items-center"
                  >
                    <div className="max-w-2xl">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-semibold ${status.badgeClass}`}
                        >
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${status.dotClass}`}
                          />
                          {status.label}
                        </span>
                        <span className="rounded-full bg-slate-100 px-3 py-1 font-semibold text-slate-700">
                          {ev._count.candidates} Kandidat
                        </span>
                        <span className="rounded-full bg-cyan-50 px-3 py-1 font-bold text-cyan-800">
                          {formatRupiah(ev.pricePerVote)} / vote
                        </span>
                      </div>

                      <h3 className="mt-4 text-xl font-bold text-slate-900 transition group-hover:text-cyan-800 sm:text-2xl">
                        {ev.title}
                      </h3>

                      {ev.description && (
                        <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-slate-600">
                          {ev.description}
                        </p>
                      )}

                      <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-slate-500">
                        <span className="inline-flex items-center gap-1.5">
                          <Calendar className="h-3.5 w-3.5 text-slate-400" />
                          Ditutup: {formatDateTimeId(ev.endsAt)}
                        </span>
                      </div>
                    </div>

                    <div className="shrink-0">
                      <span className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#1C3458] to-[#0E7490] px-6 py-3.5 text-sm font-semibold text-white shadow-xs transition group-hover:from-[#152845] group-hover:to-[#0891B2] lg:w-auto">
                        <span>Buka Halaman Voting</span>
                        <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
                      </span>
                    </div>
                  </Link>
                );
              })()}
            </div>
          ) : (
            <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {events.map((ev) => {
                const status = getEventStatus(ev.startsAt, ev.endsAt);
                return (
                  <Link
                    key={ev.id}
                    href={`/events/${ev.slug}`}
                    className="group flex flex-col rounded-3xl border border-slate-200/90 bg-white p-6 shadow-xs transition hover:-translate-y-0.5 hover:border-cyan-300 hover:shadow-md"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-semibold ${status.badgeClass}`}
                      >
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${status.dotClass}`}
                        />
                        {status.label}
                      </span>
                      <span className="font-bold text-cyan-700">
                        {formatRupiah(ev.pricePerVote)} / vote
                      </span>
                    </div>

                    <h3 className="mt-4 text-lg font-bold text-slate-900 transition group-hover:text-cyan-800">
                      {ev.title}
                    </h3>

                    {ev.description && (
                      <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-slate-600">
                        {ev.description}
                      </p>
                    )}

                    <div className="mt-auto pt-5 text-xs text-slate-500">
                      <div className="flex items-center justify-between gap-2">
                        <span className="inline-flex items-center gap-1.5">
                          <Clock className="h-3.5 w-3.5 text-slate-400" />
                          {formatDateTimeId(ev.endsAt)}
                        </span>
                        <span className="font-semibold text-slate-700">
                          {ev._count.candidates} Kandidat
                        </span>
                      </div>
                      <div className="mt-4 inline-flex items-center gap-1.5 font-semibold text-cyan-700">
                        <span>Buka Halaman Voting</span>
                        <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </section>

        {/* Profile Section */}
        <section
          id="profil"
          className="mx-auto max-w-6xl scroll-mt-20 px-4 pt-14 sm:px-6 lg:px-8"
        >
          <div className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-xs sm:p-10">
            <div className="grid items-center gap-6 lg:grid-cols-12">
              <div className="lg:col-span-7">
                <span className="text-xs font-bold uppercase tracking-wider text-cyan-700">
                  Tentang Votingin
                </span>
                <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
                  Solusi Voting Online Praktis untuk Segala Jenis Acara
                </h2>
                <p className="mt-3 text-sm leading-relaxed text-slate-600 sm:text-base">
                  Votingin mempermudah proses pemungutan suara untuk pemilihan
                  duta, ajang pencarian bakat, pemilu organisasi, hingga acara
                  komunitas. Dirancang ringan dan responsif agar tetap nyaman
                  diakses lewat ponsel maupun komputer.
                </p>
              </div>
              <div className="lg:col-span-5">
                <div className="mx-auto aspect-square w-full max-w-[260px] overflow-hidden rounded-2xl border border-slate-200/80 bg-[#1C3458] shadow-sm">
                  <img
                    src="/images/logo.jpg"
                    alt="Logo Votingin"
                    className="h-full w-full object-contain"
                  />
                </div>
              </div>
            </div>

            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {PROFILE_FEATURES.map((feat) => {
                const Icon = feat.icon;
                return (
                  <div
                    key={feat.title}
                    className="rounded-2xl border border-slate-100 bg-slate-50/80 p-5"
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-100 text-cyan-700">
                      <Icon className="h-5 w-5" />
                    </div>
                    <h3 className="mt-3.5 text-sm font-bold text-slate-900">
                      {feat.title}
                    </h3>
                    <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
                      {feat.desc}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* How to Vote Section */}
        <section
          id="cara-vote"
          className="mx-auto max-w-6xl scroll-mt-20 px-4 pt-14 sm:px-6 lg:px-8"
        >
          <div className="max-w-2xl">
            <span className="text-xs font-bold uppercase tracking-wider text-cyan-700">
              Panduan Singkat
            </span>
            <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
              Tata Cara Memberikan Vote
            </h2>
            <p className="mt-1.5 text-sm text-slate-600">
              Ikuti empat langkah berikut untuk memberikan dukungan suara Anda.
            </p>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {VOTE_STEPS.map((item) => (
              <div
                key={item.step}
                className="flex flex-col rounded-3xl border border-slate-200/90 bg-white p-5 shadow-xs"
              >
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[#1C3458] font-mono text-xs font-bold text-white">
                  {item.step}
                </span>
                <h3 className="mt-4 text-base font-bold text-slate-900">
                  {item.title}
                </h3>
                <p className="mt-1.5 text-xs leading-relaxed text-slate-600 sm:text-sm">
                  {item.desc}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* FAQ Section */}
        <section
          id="faq"
          className="mx-auto max-w-6xl scroll-mt-20 px-4 py-14 sm:px-6 lg:px-8"
        >
          <div className="flex items-center gap-2">
            <HelpCircle className="h-5 w-5 text-cyan-700" />
            <h2 className="text-2xl font-bold tracking-tight text-slate-900">
              Pertanyaan Umum
            </h2>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {FAQS.map((item) => (
              <details
                key={item.q}
                className="group rounded-2xl border border-slate-200/90 bg-white p-5 shadow-2xs"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-bold text-slate-900">
                  <span>{item.q}</span>
                  <ChevronDown className="h-4 w-4 shrink-0 text-slate-400 transition group-open:rotate-180" />
                </summary>
                <p className="mt-3 text-xs leading-relaxed text-slate-600 sm:text-sm">
                  {item.a}
                </p>
              </details>
            ))}
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200/80 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-6 text-center text-xs text-slate-500 sm:px-6 lg:px-8">
          © 2026 Votingin
        </div>
      </footer>
    </div>
  );
}
