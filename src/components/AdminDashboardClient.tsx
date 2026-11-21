"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Eye,
  EyeOff,
  FileCheck2,
  FlaskConical,
  LogOut,
  Plus,
  Printer,
  RefreshCw,
  Settings,
  Trash2,
  X,
  XCircle,
} from "lucide-react";
import { formatDateTimeId, formatRupiah } from "@/lib/format";

interface CandidateItem {
  id: string;
  eventId: string;
  number: number;
  name: string;
  description: string | null;
  photoUrl: string | null;
  totalVotes: number;
}

interface EventItem {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  pricePerVote: number;
  qrisImageUrl: string | null;
  qrisRawPayload: string | null;
  startsAt: string;
  endsAt: string;
  orderCutoffMinutes: number;
  isBlindMode: boolean;
  isActive: boolean;
  candidates: CandidateItem[];
}

interface OrderItem {
  id: string;
  eventId: string;
  voterName: string;
  isAnonymous: boolean;
  supportMessage: string | null;
  voteQty: number;
  baseAmount: number;
  uniqueCode: number;
  totalAmount: number;
  status: string;
  expiresAt: string;
  paidAt: string | null;
  createdAt: string;
  event: { title: string; slug: string };
  candidate: { number: number; name: string };
}

interface MutationItem {
  id: string;
  eventId: string | null;
  amount: number;
  rrn: string;
  rawMessage: string | null;
  source: string;
  status: string;
  matchedOrderId: string | null;
  transactionAt: string;
  receivedAt: string;
}

interface ProofItem {
  id: string;
  orderId: string;
  imageUrl: string;
  imageHash: string;
  rrnInput: string | null;
  status: string;
  reviewNote: string | null;
  createdAt: string;
  order: {
    id: string;
    voterName: string;
    isAnonymous?: boolean;
    totalAmount: number;
    status: string;
    event: { title: string; slug: string };
    candidate: { number: number; name: string };
  };
}

interface HeartbeatItem {
  id: string;
  deviceName: string;
  lastPingAt: string;
  status: string;
}

interface AuditLogItem {
  id: string;
  actor: string;
  action: string;
  targetId: string | null;
  metadata: unknown;
  createdAt: string;
}

interface OverviewPayload {
  summary: {
    totalPaidAmount: number;
    totalBaseRevenue: number;
    totalUniqueCodeRevenue: number;
    totalMatchedMutationsAmount: number;
    totalMatchedMutationsCount: number;
    totalVotesRecorded: number;
    totalLedgerEntries: number;
  };
  events: EventItem[];
  orders: OrderItem[];
  mutations: MutationItem[];
  proofs: ProofItem[];
  heartbeats: HeartbeatItem[];
  auditLogs: AuditLogItem[];
}

type AdminTab = "overview" | "events" | "reconcile" | "simulator" | "audit";

function toDateTimeLocalValue(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

export default function AdminDashboardClient() {
  const router = useRouter();
  const [data, setData] = useState<OverviewPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<AdminTab>("overview");
  const [toast, setToast] = useState<{
    type: "ok" | "err";
    text: string;
  } | null>(null);

  // Create Event form state
  const [evTitle, setEvTitle] = useState("");
  const [evSlug, setEvSlug] = useState("");
  const [evDesc, setEvDesc] = useState("");
  const [evPrice, setEvPrice] = useState(2000);
  const [evCutoff, setEvCutoff] = useState(15);
  const [evStarts, setEvStarts] = useState(() =>
    toDateTimeLocalValue(new Date(Date.now() - 3600_000).toISOString())
  );
  const [evEnds, setEvEnds] = useState(() =>
    toDateTimeLocalValue(new Date(Date.now() + 7 * 86400_000).toISOString())
  );
  const [evQrisRaw, setEvQrisRaw] = useState("");
  const [evQrisFile, setEvQrisFile] = useState<File | null>(null);
  const [evBlind, setEvBlind] = useState(false);

  // Edit Event Settings modal state
  const [editingEvent, setEditingEvent] = useState<EventItem | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editSlug, setEditSlug] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editPrice, setEditPrice] = useState(2000);
  const [editCutoff, setEditCutoff] = useState(15);
  const [editStarts, setEditStarts] = useState("");
  const [editEnds, setEditEnds] = useState("");
  const [editQrisRaw, setEditQrisRaw] = useState("");
  const [editQrisFile, setEditQrisFile] = useState<File | null>(null);
  const [editBlind, setEditBlind] = useState(false);
  const [editActive, setEditActive] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Delete Event modal state
  const [deletingEvent, setDeletingEvent] = useState<EventItem | null>(null);
  const [deleteConfirmSlug, setDeleteConfirmSlug] = useState("");
  const [deletingBusy, setDeletingBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Print Document selector modal state
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [printEventId, setPrintEventId] = useState("");

  // Create Candidate form state
  const [candEventId, setCandEventId] = useState("");
  const [candNumber, setCandNumber] = useState(1);
  const [candName, setCandName] = useState("");
  const [candDesc, setCandDesc] = useState("");
  const [candPhoto, setCandPhoto] = useState<File | null>(null);

  // Simulator form state
  const [simAmount, setSimAmount] = useState("");
  const [simRrn, setSimRrn] = useState("");
  const [simMsg, setSimMsg] = useState("");
  const [simEventId, setSimEventId] = useState("");

  // Link mutation state
  const [linkMutationId, setLinkMutationId] = useState("");
  const [linkOrderId, setLinkOrderId] = useState("");

  const notify = (type: "ok" | "err", text: string) => {
    setToast({ type, text });
    setTimeout(() => setToast(null), 5000);
  };

  const loadOverview = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/overview", { cache: "no-store" });
      if (res.status === 401) {
        router.push("/admin/login");
        return;
      }
      if (res.ok) {
        const json = (await res.json()) as OverviewPayload;
        setData(json);
        if (!candEventId && json.events[0]) {
          setCandEventId(json.events[0].id);
        }
        setPrintEventId((prev) =>
          prev && json.events.some((ev) => ev.id === prev)
            ? prev
            : json.events[0]?.id ?? ""
        );
      }
    } finally {
      setLoading(false);
    }
  }, [candEventId, router]);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  function openDeleteEventModal(ev: EventItem) {
    setDeletingEvent(ev);
    setDeleteConfirmSlug("");
    setDeleteError(null);
  }

  async function handleDeleteEvent(e: React.FormEvent) {
    e.preventDefault();
    if (!deletingEvent) return;

    const deletedId = deletingEvent.id;
    const deletedTitle = deletingEvent.title;
    setDeletingBusy(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/admin/events/${deletedId}`, {
        method: "DELETE",
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setDeleteError(json.error ?? "Gagal menghapus event.");
        return;
      }

      setDeletingEvent(null);
      if (editingEvent?.id === deletedId) setEditingEvent(null);
      if (candEventId === deletedId) setCandEventId("");
      if (simEventId === deletedId) setSimEventId("");
      if (printEventId === deletedId) setPrintEventId("");

      notify("ok", `Event "${deletedTitle}" berhasil dihapus.`);
      await loadOverview();
    } catch {
      setDeleteError("Gangguan jaringan saat menghapus event.");
    } finally {
      setDeletingBusy(false);
    }
  }

  function openPrintModal() {
    if (!data) return;
    const stillValid = data.events.some((ev) => ev.id === printEventId);
    if (!stillValid) {
      setPrintEventId(data.events[0]?.id ?? "");
    }
    setShowPrintModal(true);
  }

  function handleOpenPrintDocument(e: React.FormEvent) {
    e.preventDefault();
    if (!printEventId) return;
    window.open(
      `/admin/events/${printEventId}/print`,
      "_blank",
      "noopener,noreferrer"
    );
    setShowPrintModal(false);
  }

  function openEventSettings(ev: EventItem) {
    setEditingEvent(ev);
    setEditTitle(ev.title);
    setEditSlug(ev.slug);
    setEditDesc(ev.description ?? "");
    setEditPrice(ev.pricePerVote);
    setEditCutoff(ev.orderCutoffMinutes);
    setEditStarts(toDateTimeLocalValue(ev.startsAt));
    setEditEnds(toDateTimeLocalValue(ev.endsAt));
    setEditQrisRaw(ev.qrisRawPayload ?? "");
    setEditQrisFile(null);
    setEditBlind(ev.isBlindMode);
    setEditActive(ev.isActive);
    setEditError(null);
  }

  async function handleSaveEventSettings(e: React.FormEvent) {
    e.preventDefault();
    if (!editingEvent) return;

    setSavingSettings(true);
    setEditError(null);
    try {
      const formData = new FormData();
      formData.append("title", editTitle);
      formData.append("slug", editSlug);
      formData.append("description", editDesc);
      formData.append("pricePerVote", String(editPrice));
      formData.append("orderCutoffMinutes", String(editCutoff));
      formData.append("startsAt", new Date(editStarts).toISOString());
      formData.append("endsAt", new Date(editEnds).toISOString());
      formData.append("qrisRawPayload", editQrisRaw);
      formData.append("isBlindMode", String(editBlind));
      formData.append("isActive", String(editActive));
      if (editQrisFile) {
        formData.append("qrisImage", editQrisFile);
      }

      const res = await fetch(`/api/admin/events/${editingEvent.id}`, {
        method: "PATCH",
        body: formData,
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setEditError(json.error ?? "Gagal menyimpan pengaturan event.");
        return;
      }

      setEditingEvent(null);
      notify("ok", "Pengaturan event berhasil disimpan.");
      await loadOverview();
    } catch {
      setEditError("Gangguan jaringan saat menyimpan pengaturan.");
    } finally {
      setSavingSettings(false);
    }
  }

  async function handleLogout() {
    await fetch("/api/admin/auth", { method: "DELETE" });
    router.push("/admin/login");
    router.refresh();
  }

  async function handleCreateEvent(e: React.FormEvent) {
    e.preventDefault();
    const formData = new FormData();
    formData.append("title", evTitle);
    formData.append("slug", evSlug);
    formData.append("description", evDesc);
    formData.append("pricePerVote", String(evPrice));
    formData.append("orderCutoffMinutes", String(evCutoff));
    formData.append("startsAt", new Date(evStarts).toISOString());
    formData.append("endsAt", new Date(evEnds).toISOString());
    formData.append("qrisRawPayload", evQrisRaw);
    formData.append("isBlindMode", String(evBlind));
    formData.append("isActive", "true");
    if (evQrisFile) {
      formData.append("qrisImage", evQrisFile);
    }

    const res = await fetch("/api/admin/events", {
      method: "POST",
      body: formData,
    });
    const json = (await res.json()) as { error?: string };
    if (!res.ok) {
      notify("err", json.error ?? "Gagal membuat event.");
      return;
    }

    notify("ok", "Event berhasil dibuat.");
    setEvTitle("");
    setEvSlug("");
    setEvDesc("");
    setEvQrisRaw("");
    setEvQrisFile(null);
    await loadOverview();
  }

  async function handleToggleEventFlag(
    event: EventItem,
    field: "isBlindMode" | "isActive"
  ) {
    const res = await fetch(`/api/admin/events/${event.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: !event[field] }),
    });
    if (res.ok) {
      notify("ok", "Status event diperbarui.");
      await loadOverview();
    }
  }

  async function handleCreateCandidate(e: React.FormEvent) {
    e.preventDefault();
    const formData = new FormData();
    formData.append("eventId", candEventId);
    formData.append("number", String(candNumber));
    formData.append("name", candName);
    formData.append("description", candDesc);
    if (candPhoto) {
      formData.append("photo", candPhoto);
    }

    const res = await fetch("/api/admin/candidates", {
      method: "POST",
      body: formData,
    });
    const json = (await res.json()) as { error?: string };
    if (!res.ok) {
      notify("err", json.error ?? "Gagal menambah kandidat.");
      return;
    }

    notify("ok", "Kandidat berhasil ditambahkan.");
    setCandName("");
    setCandDesc("");
    setCandNumber((n) => n + 1);
    setCandPhoto(null);
    await loadOverview();
  }

  async function handleDeleteCandidate(id: string) {
    const res = await fetch(`/api/admin/candidates/${id}`, {
      method: "DELETE",
    });
    const json = (await res.json()) as { error?: string };
    if (!res.ok) {
      notify("err", json.error ?? "Gagal menghapus kandidat.");
      return;
    }
    notify("ok", "Kandidat dihapus.");
    await loadOverview();
  }

  async function handleSimulateMutation(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/admin/simulate-mutation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: Number.parseInt(simAmount, 10),
        rrn: simRrn.trim() || undefined,
        rawMessage: simMsg.trim() || undefined,
        eventId: simEventId || undefined,
      }),
    });
    const json = (await res.json()) as {
      status?: string;
      message?: string;
      error?: string;
    };
    if (!res.ok) {
      notify("err", json.error ?? json.message ?? "Simulasi gagal.");
      return;
    }
    notify("ok", `[${json.status}] ${json.message ?? "Mutasi diproses."}`);
    setSimRrn("");
    await loadOverview();
  }

  async function handleReviewProof(
    proofId: string,
    mode: "APPROVE_PROOF" | "REJECT_PROOF"
  ) {
    const res = await fetch("/api/admin/reconcile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode, proofId }),
    });
    const json = (await res.json()) as { error?: string };
    if (!res.ok) {
      notify("err", json.error ?? "Gagal memproses bukti.");
      return;
    }
    notify(
      "ok",
      mode === "APPROVE_PROOF"
        ? "Bukti disetujui dan suara dicatat."
        : "Bukti ditolak."
    );
    await loadOverview();
  }

  async function handleLinkMutation(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/admin/reconcile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "LINK_MUTATION",
        mutationId: linkMutationId,
        orderId: linkOrderId,
      }),
    });
    const json = (await res.json()) as { error?: string };
    if (!res.ok) {
      notify("err", json.error ?? "Gagal menautkan mutasi.");
      return;
    }
    notify("ok", "Mutasi ditautkan dan order selesai diproses.");
    setLinkMutationId("");
    setLinkOrderId("");
    await loadOverview();
  }

  if (loading || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-slate-500">
        Memuat dashboard admin...
      </div>
    );
  }

  const pendingOrders = data.orders.filter((o) => o.status === "PENDING");
  const reconcilableOrders = data.orders.filter((o) =>
    ["PENDING", "EXPIRED", "LATE_PAYMENT"].includes(o.status)
  );
  const unmatchedMutations = data.mutations.filter(
    (m) => m.status === "UNMATCHED"
  );
  const pendingProofs = data.proofs.filter(
    (p) => p.status === "PENDING_REVIEW"
  );

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-30 border-b border-slate-200/90 bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3.5 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 shrink-0 overflow-hidden rounded-xl border border-slate-200/80 bg-[#1C3458] shadow-xs">
              <img
                src="/images/logo-icon.png"
                alt="Logo Votingin"
                className="h-full w-full object-cover"
              />
            </div>
            <div>
              <h1 className="text-base font-bold text-slate-900">
                Dashboard Admin
              </h1>
              <p className="text-xs text-slate-500">
                Kelola Event, Order, dan Rekonsiliasi
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={openPrintModal}
              disabled={data.events.length === 0}
              className="inline-flex items-center gap-1.5 rounded-xl border border-cyan-200 bg-cyan-50 px-3 py-2 text-xs font-semibold text-cyan-800 transition hover:bg-cyan-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Printer className="h-3.5 w-3.5" />
              <span>Cetak Dokumen</span>
            </button>
            <Link
              href="/"
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Halaman Publik
            </Link>
            <button
              type="button"
              onClick={loadOverview}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span>Refresh</span>
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#1C3458] px-3 py-2 text-xs font-semibold text-white transition hover:bg-[#152845]"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span>Keluar</span>
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="mx-auto flex max-w-7xl gap-2 overflow-x-auto px-4 pb-3 sm:px-6 lg:px-8">
          {(
            [
              ["overview", "Ringkasan & Order"],
              ["events", `Event & Kandidat (${data.events.length})`],
              [
                "reconcile",
                `Rekonsiliasi (${
                  unmatchedMutations.length + pendingProofs.length
                })`,
              ],
              ["simulator", "Simulator Mutasi"],
              ["audit", "Audit Log"],
            ] as Array<[AdminTab, string]>
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`shrink-0 rounded-xl px-3.5 py-2 text-xs font-semibold transition ${
                tab === key
                  ? "bg-gradient-to-r from-[#1C3458] to-[#0E7490] text-white shadow-xs"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {toast && (
          <div
            className={`mb-5 rounded-2xl border px-4 py-3 text-xs font-semibold shadow-xs ${
              toast.type === "ok"
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-rose-200 bg-rose-50 text-rose-800"
            }`}
          >
            {toast.text}
          </div>
        )}

        {/* Summary Cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs">
            <div className="text-xs font-medium text-slate-500">
              Total Dana Masuk
            </div>
            <div className="mt-1 text-2xl font-bold text-slate-900">
              {formatRupiah(data.summary.totalPaidAmount)}
            </div>
            <div className="mt-1 text-[11px] text-slate-500">
              Pokok: {formatRupiah(data.summary.totalBaseRevenue)} + Kode Unik:{" "}
              {formatRupiah(data.summary.totalUniqueCodeRevenue)}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs">
            <div className="text-xs font-medium text-slate-500">
              Total Suara Sah
            </div>
            <div className="mt-1 text-2xl font-bold text-[#1C3458]">
              {new Intl.NumberFormat("id-ID").format(
                data.summary.totalVotesRecorded
              )}
            </div>
            <div className="mt-1 text-[11px] text-slate-500">
              {data.summary.totalLedgerEntries} transaksi tercatat
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs">
            <div className="text-xs font-medium text-slate-500">
              Mutasi Terverifikasi
            </div>
            <div className="mt-1 text-2xl font-bold text-emerald-700">
              {formatRupiah(data.summary.totalMatchedMutationsAmount)}
            </div>
            <div className="mt-1 text-[11px] text-slate-500">
              {data.summary.totalMatchedMutationsCount} cocok •{" "}
              {unmatchedMutations.length} belum cocok
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs">
            <div className="flex items-center justify-between text-xs font-medium text-slate-500">
              <span>Status Listener</span>
              <Activity className="h-4 w-4 text-slate-400" />
            </div>
            {data.heartbeats.length === 0 ? (
              <div className="mt-2 text-xs font-medium text-amber-700">
                Belum ada perangkat listener terhubung
              </div>
            ) : (
              <div className="mt-2 space-y-1">
                {data.heartbeats.map((hb) => {
                  const ageMin = Math.round(
                    (Date.now() - new Date(hb.lastPingAt).getTime()) / 60000
                  );
                  return (
                    <div key={hb.id} className="text-xs">
                      <span className="font-semibold text-slate-900">
                        {hb.deviceName}
                      </span>{" "}
                      <span
                        className={
                          ageMin <= 5 ? "text-emerald-600" : "text-rose-600"
                        }
                      >
                        ({hb.status}, {ageMin}m lalu)
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Tab: Overview */}
        {tab === "overview" && (
          <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-bold text-slate-900">
                Daftar Order Terbaru ({data.orders.length})
              </h2>
              <span className="text-xs text-slate-500">
                Menunggu bayar: {pendingOrders.length}
              </span>
            </div>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[680px] text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="py-2.5 pr-3">Waktu</th>
                    <th className="py-2.5 pr-3">Pemilih</th>
                    <th className="py-2.5 pr-3">Event & Kandidat</th>
                    <th className="py-2.5 pr-3">Qty</th>
                    <th className="py-2.5 pr-3">Nominal</th>
                    <th className="py-2.5 pr-3">Status</th>
                    <th className="py-2.5">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.orders.map((o) => (
                    <tr key={o.id}>
                      <td className="py-3 pr-3 whitespace-nowrap text-slate-500">
                        {formatDateTimeId(o.createdAt)}
                      </td>
                      <td className="py-3 pr-3">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-semibold text-slate-900">
                            {o.isAnonymous ? "Anonim" : o.voterName}
                          </span>
                          {o.isAnonymous && (
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                              Anonim
                            </span>
                          )}
                        </div>
                        {o.supportMessage && (
                          <div className="mt-0.5 max-w-xs truncate text-[11px] italic text-slate-500">
                            &ldquo;{o.supportMessage}&rdquo;
                          </div>
                        )}
                      </td>
                      <td className="py-3 pr-3">
                        <div className="font-medium text-slate-800">
                          {o.event.title}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          No. {o.candidate.number} {o.candidate.name}
                        </div>
                      </td>
                      <td className="py-3 pr-3 font-semibold">{o.voteQty}</td>
                      <td className="py-3 pr-3 font-mono font-bold text-slate-900">
                        {formatRupiah(o.totalAmount)}
                      </td>
                      <td className="py-3 pr-3">
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                            o.status === "PAID"
                              ? "bg-emerald-100 text-emerald-700"
                              : o.status === "PENDING"
                              ? "bg-amber-100 text-amber-800"
                              : o.status === "LATE_PAYMENT"
                              ? "bg-rose-100 text-rose-700"
                              : "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {o.status}
                        </span>
                      </td>
                      <td className="py-3">
                        {o.status === "PENDING" && (
                          <button
                            type="button"
                            onClick={() => {
                              setSimAmount(String(o.totalAmount));
                              setSimEventId(o.eventId);
                              setTab("simulator");
                            }}
                            className="text-xs font-semibold text-cyan-700 hover:underline"
                          >
                            Simulasi Bayar
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {data.orders.length === 0 && (
                    <tr>
                      <td
                        colSpan={7}
                        className="py-8 text-center text-slate-500"
                      >
                        Belum ada pesanan vote.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Tab: Events & Candidates */}
        {tab === "events" && (
          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <form
              onSubmit={handleCreateEvent}
              className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs sm:p-6"
            >
              <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
                <Plus className="h-4 w-4 text-cyan-700" />
                <span>Buat Event Baru</span>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Judul Event
                  </label>
                  <input
                    type="text"
                    required
                    value={evTitle}
                    onChange={(e) => setEvTitle(e.target.value)}
                    placeholder="Pemilihan Duta Kampus"
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-xs focus:border-cyan-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Slug URL
                  </label>
                  <input
                    type="text"
                    required
                    value={evSlug}
                    onChange={(e) => setEvSlug(e.target.value)}
                    placeholder="duta-kampus-2026"
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-xs focus:border-cyan-600 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  Deskripsi
                </label>
                <textarea
                  rows={2}
                  value={evDesc}
                  onChange={(e) => setEvDesc(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-xs focus:border-cyan-600 focus:outline-none"
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Harga per Vote (Min Rp1.000)
                  </label>
                  <input
                    type="number"
                    min={1000}
                    required
                    value={evPrice}
                    onChange={(e) => setEvPrice(Number(e.target.value))}
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-xs focus:border-cyan-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Batas Order (Menit sblm tutup)
                  </label>
                  <input
                    type="number"
                    min={0}
                    required
                    value={evCutoff}
                    onChange={(e) => setEvCutoff(Number(e.target.value))}
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-xs focus:border-cyan-600 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Waktu Mulai
                  </label>
                  <input
                    type="datetime-local"
                    required
                    value={evStarts}
                    onChange={(e) => setEvStarts(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-xs focus:border-cyan-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Waktu Berakhir
                  </label>
                  <input
                    type="datetime-local"
                    required
                    value={evEnds}
                    onChange={(e) => setEvEnds(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-xs focus:border-cyan-600 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  Gambar QRIS (Opsional, PNG/JPG/WEBP)
                </label>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(e) => setEvQrisFile(e.target.files?.[0] ?? null)}
                  className="mt-1 block w-full text-xs text-slate-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  Data String QRIS (Opsional, untuk QR nominal otomatis)
                </label>
                <textarea
                  rows={2}
                  value={evQrisRaw}
                  onChange={(e) => setEvQrisRaw(e.target.value)}
                  placeholder="000201010211..."
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 font-mono text-[11px] focus:border-cyan-600 focus:outline-none"
                />
              </div>

              <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-slate-700">
                <input
                  type="checkbox"
                  checked={evBlind}
                  onChange={(e) => setEvBlind(e.target.checked)}
                />
                <span>
                  Aktifkan Blind Mode (sembunyikan perolehan suara publik)
                </span>
              </label>

              <button
                type="submit"
                className="w-full rounded-xl bg-gradient-to-r from-[#1C3458] to-[#0E7490] py-2.5 text-xs font-semibold text-white transition hover:from-[#152845] hover:to-[#0891B2]"
              >
                Simpan Event
              </button>
            </form>

            {/* Add Candidate Form */}
            <form
              onSubmit={handleCreateCandidate}
              className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs sm:p-6"
            >
              <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
                <Plus className="h-4 w-4 text-cyan-700" />
                <span>Tambah Kandidat</span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  Pilih Event
                </label>
                <select
                  required
                  value={candEventId}
                  onChange={(e) => setCandEventId(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-xs focus:border-cyan-600 focus:outline-none"
                >
                  <option value="">-- Pilih Event --</option>
                  {data.events.map((ev) => (
                    <option key={ev.id} value={ev.id}>
                      {ev.title} ({ev.slug})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    No. Urut
                  </label>
                  <input
                    type="number"
                    min={1}
                    required
                    value={candNumber}
                    onChange={(e) => setCandNumber(Number(e.target.value))}
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-xs focus:border-cyan-600 focus:outline-none"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700">
                    Nama Kandidat
                  </label>
                  <input
                    type="text"
                    required
                    value={candName}
                    onChange={(e) => setCandName(e.target.value)}
                    placeholder="Nama Lengkap Kandidat"
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-xs focus:border-cyan-600 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  Visi / Deskripsi Singkat
                </label>
                <textarea
                  rows={2}
                  value={candDesc}
                  onChange={(e) => setCandDesc(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-xs focus:border-cyan-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  Foto Kandidat (Opsional)
                </label>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(e) => setCandPhoto(e.target.files?.[0] ?? null)}
                  className="mt-1 block w-full text-xs text-slate-600"
                />
              </div>

              <button
                type="submit"
                disabled={!candEventId}
                className="w-full rounded-xl bg-[#1C3458] py-2.5 text-xs font-semibold text-white transition hover:bg-[#152845] disabled:bg-slate-300"
              >
                Tambah Kandidat
              </button>
            </form>

            {/* Existing Events List */}
            <div className="space-y-4 lg:col-span-2">
              {data.events.map((ev) => (
                <div
                  key={ev.id}
                  className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-bold text-slate-900">
                          {ev.title}
                        </h3>
                        <Link
                          href={`/events/${ev.slug}`}
                          className="text-xs font-semibold text-cyan-700 hover:underline"
                        >
                          /events/{ev.slug}
                        </Link>
                      </div>
                      <p className="mt-0.5 text-xs text-slate-500">
                        Harga: {formatRupiah(ev.pricePerVote)} • Selesai:{" "}
                        {formatDateTimeId(ev.endsAt)} • QRIS:{" "}
                        {ev.qrisRawPayload ? "Otomatis" : "Statis"}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/admin/events/${ev.id}/print`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                      >
                        <Printer className="h-3.5 w-3.5" />
                        <span>Cetak</span>
                      </Link>
                      <button
                        type="button"
                        onClick={() => openEventSettings(ev)}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-cyan-200 bg-cyan-50 px-3 py-1.5 text-xs font-semibold text-cyan-800 transition hover:bg-cyan-100"
                      >
                        <Settings className="h-3.5 w-3.5" />
                        <span>Pengaturan</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleToggleEventFlag(ev, "isBlindMode")}
                        className="inline-flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                      >
                        {ev.isBlindMode ? (
                          <EyeOff className="h-3.5 w-3.5 text-amber-600" />
                        ) : (
                          <Eye className="h-3.5 w-3.5 text-emerald-600" />
                        )}
                        <span>
                          {ev.isBlindMode ? "Blind ON" : "Blind OFF"}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleToggleEventFlag(ev, "isActive")}
                        className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
                          ev.isActive
                            ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-200"
                            : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                        }`}
                      >
                        {ev.isActive ? "Aktif" : "Nonaktif"}
                      </button>
                      <button
                        type="button"
                        onClick={() => openDeleteEventModal(ev)}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-100"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        <span>Hapus</span>
                      </button>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {ev.candidates.map((c) => (
                      <div
                        key={c.id}
                        className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 p-3 text-xs"
                      >
                        <div>
                          <div className="font-bold text-slate-900">
                            No. {c.number} — {c.name}
                          </div>
                          <div className="text-slate-500">
                            {c.totalVotes} suara sah
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDeleteCandidate(c.id)}
                          className="rounded-lg p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                          title="Hapus kandidat"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tab: Reconcile */}
        {tab === "reconcile" && (
          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            {/* Pending Manual Proofs */}
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
                <FileCheck2 className="h-4 w-4 text-cyan-700" />
                <span>
                  Antrean Bukti Pembayaran Manual ({pendingProofs.length})
                </span>
              </div>
              <div className="mt-4 space-y-4">
                {pendingProofs.map((p) => (
                  <div
                    key={p.id}
                    className="rounded-2xl border border-slate-200 p-4 text-xs"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-bold text-slate-900">
                          {p.order.isAnonymous ? "Anonim" : p.order.voterName} —{" "}
                          {formatRupiah(p.order.totalAmount)}
                        </div>
                        <div className="text-slate-500">
                          {p.order.event.title} • No. {p.order.candidate.number}{" "}
                          {p.order.candidate.name}
                        </div>
                        <div className="mt-1 font-mono text-[11px] text-slate-500">
                          Order: {p.orderId} ({p.order.status}) • RRN:{" "}
                          {p.rrnInput ?? "-"}
                        </div>
                      </div>
                      <a
                        href={p.imageUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="shrink-0 rounded-lg bg-slate-100 px-2.5 py-1 font-semibold text-cyan-700 hover:bg-slate-200"
                      >
                        Lihat Gambar
                      </a>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          handleReviewProof(p.id, "APPROVE_PROOF")
                        }
                        className="inline-flex items-center gap-1 rounded-xl bg-emerald-600 px-3 py-1.5 font-semibold text-white hover:bg-emerald-700"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        <span>Setujui & Catat Vote</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleReviewProof(p.id, "REJECT_PROOF")}
                        className="inline-flex items-center gap-1 rounded-xl bg-rose-600 px-3 py-1.5 font-semibold text-white hover:bg-rose-700"
                      >
                        <XCircle className="h-3.5 w-3.5" />
                        <span>Tolak</span>
                      </button>
                    </div>
                  </div>
                ))}
                {pendingProofs.length === 0 && (
                  <p className="text-xs text-slate-500">
                    Tidak ada bukti manual yang menunggu peninjauan.
                  </p>
                )}
              </div>
            </section>

            {/* Unmatched Mutations Linker */}
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
              <h2 className="text-sm font-bold text-slate-900">
                Tautkan Mutasi Belum Cocok ({unmatchedMutations.length})
              </h2>
              <form onSubmit={handleLinkMutation} className="mt-4 space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Pilih Mutasi
                  </label>
                  <select
                    required
                    value={linkMutationId}
                    onChange={(e) => setLinkMutationId(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-xs"
                  >
                    <option value="">-- Pilih Mutasi --</option>
                    {unmatchedMutations.map((m) => (
                      <option key={m.id} value={m.id}>
                        {formatRupiah(m.amount)} — RRN {m.rrn} ({m.source})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Pilih Order Target
                  </label>
                  <select
                    required
                    value={linkOrderId}
                    onChange={(e) => setLinkOrderId(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-xs"
                  >
                    <option value="">-- Pilih Order --</option>
                    {reconcilableOrders.map((o) => (
                      <option key={o.id} value={o.id}>
                        {formatRupiah(o.totalAmount)} —{" "}
                        {o.isAnonymous ? "Anonim" : o.voterName} ({o.status})
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  type="submit"
                  className="rounded-xl bg-gradient-to-r from-[#1C3458] to-[#0E7490] px-4 py-2 text-xs font-semibold text-white transition hover:from-[#152845] hover:to-[#0891B2]"
                >
                  Tautkan & Selesaikan Order
                </button>
              </form>
            </section>
          </div>
        )}

        {/* Tab: Mutation Simulator */}
        {tab === "simulator" && (
          <section className="mt-6 max-w-xl rounded-2xl border border-slate-200 bg-white p-5 shadow-xs sm:p-6">
            <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
              <FlaskConical className="h-4 w-4 text-cyan-700" />
              <span>Simulator Mutasi Masuk</span>
            </div>
            <p className="mt-1 text-xs text-slate-600">
              Simulasikan mutasi masuk untuk menguji pencocokan nominal unik.
            </p>

            <form onSubmit={handleSimulateMutation} className="mt-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  Nominal Masuk (Rp)
                </label>
                <input
                  type="number"
                  min={1}
                  required
                  value={simAmount}
                  onChange={(e) => setSimAmount(e.target.value)}
                  placeholder="Contoh: 2123"
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3.5 py-2 font-mono text-sm font-bold"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  RRN / ID Referensi (Opsional)
                </label>
                <input
                  type="text"
                  value={simRrn}
                  onChange={(e) => setSimRrn(e.target.value)}
                  placeholder="Contoh: RRN-TEST-001"
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3.5 py-2 font-mono text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  Event (Opsional)
                </label>
                <select
                  value={simEventId}
                  onChange={(e) => setSimEventId(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-xs"
                >
                  <option value="">Semua Event</option>
                  {data.events.map((ev) => (
                    <option key={ev.id} value={ev.id}>
                      {ev.title}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  Catatan Mutasi (Opsional)
                </label>
                <input
                  type="text"
                  value={simMsg}
                  onChange={(e) => setSimMsg(e.target.value)}
                  placeholder="QRIS Payment Received..."
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3.5 py-2 text-xs"
                />
              </div>

              <button
                type="submit"
                className="w-full rounded-xl bg-gradient-to-r from-[#1C3458] to-[#0E7490] py-2.5 text-xs font-semibold text-white transition hover:from-[#152845] hover:to-[#0891B2]"
              >
                Kirim Simulasi Mutasi
              </button>
            </form>
          </section>
        )}

        {/* Tab: Audit Log */}
        {tab === "audit" && (
          <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
            <h2 className="text-sm font-bold text-slate-900">
              Riwayat Audit Log (50 Terbaru)
            </h2>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="py-2 pr-3">Waktu</th>
                    <th className="py-2 pr-3">Aktor</th>
                    <th className="py-2 pr-3">Aksi</th>
                    <th className="py-2 pr-3">Target</th>
                    <th className="py-2">Detail</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.auditLogs.map((log) => (
                    <tr key={log.id}>
                      <td className="py-2 pr-3 whitespace-nowrap text-slate-500">
                        {formatDateTimeId(log.createdAt)}
                      </td>
                      <td className="py-2 pr-3 font-semibold text-slate-800">
                        {log.actor}
                      </td>
                      <td className="py-2 pr-3 font-mono text-cyan-800">
                        {log.action}
                      </td>
                      <td className="py-2 pr-3 font-mono text-slate-500">
                        {log.targetId ?? "-"}
                      </td>
                      <td className="py-2 font-mono text-[11px] text-slate-600">
                        {log.metadata ? JSON.stringify(log.metadata) : "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </main>

      {/* Event Settings Modal */}
      {editingEvent && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 p-0 backdrop-blur-xs sm:items-center sm:p-4">
          <div className="max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:max-w-xl sm:rounded-3xl sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-cyan-700">
                  Pengaturan Event
                </span>
                <h2 className="mt-0.5 text-lg font-bold text-slate-900">
                  {editingEvent.title}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setEditingEvent(null)}
                className="rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                aria-label="Tutup pengaturan"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEventSettings} className="mt-5 space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Judul Event
                  </label>
                  <input
                    type="text"
                    required
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-xs focus:border-cyan-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Slug URL
                  </label>
                  <input
                    type="text"
                    required
                    value={editSlug}
                    onChange={(e) => setEditSlug(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-xs focus:border-cyan-600 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  Deskripsi
                </label>
                <textarea
                  rows={2}
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-xs focus:border-cyan-600 focus:outline-none"
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Harga per Vote (Min Rp1.000)
                  </label>
                  <input
                    type="number"
                    min={1000}
                    required
                    value={editPrice}
                    onChange={(e) => setEditPrice(Number(e.target.value))}
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-xs focus:border-cyan-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Batas Order (Menit sblm tutup)
                  </label>
                  <input
                    type="number"
                    min={0}
                    required
                    value={editCutoff}
                    onChange={(e) => setEditCutoff(Number(e.target.value))}
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-xs focus:border-cyan-600 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Waktu Mulai
                  </label>
                  <input
                    type="datetime-local"
                    required
                    value={editStarts}
                    onChange={(e) => setEditStarts(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-xs focus:border-cyan-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Waktu Berakhir
                  </label>
                  <input
                    type="datetime-local"
                    required
                    value={editEnds}
                    onChange={(e) => setEditEnds(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-xs focus:border-cyan-600 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  Ganti Gambar QRIS (Opsional)
                </label>
                {editingEvent.qrisImageUrl && (
                  <div className="mt-1.5 flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-2">
                    <img
                      src={editingEvent.qrisImageUrl}
                      alt="QRIS saat ini"
                      className="h-12 w-12 rounded-lg object-contain bg-white"
                    />
                    <span className="text-[11px] text-slate-600">
                      Gambar QRIS saat ini aktif. Unggah file baru jika ingin
                      mengganti.
                    </span>
                  </div>
                )}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(e) => setEditQrisFile(e.target.files?.[0] ?? null)}
                  className="mt-2 block w-full text-xs text-slate-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  Data String QRIS (Opsional)
                </label>
                <textarea
                  rows={2}
                  value={editQrisRaw}
                  onChange={(e) => setEditQrisRaw(e.target.value)}
                  placeholder="Kosongkan jika tidak menggunakan QR otomatis"
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 font-mono text-[11px] focus:border-cyan-600 focus:outline-none"
                />
              </div>

              <div className="flex flex-wrap gap-4 rounded-2xl bg-slate-50 p-3.5">
                <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-slate-700">
                  <input
                    type="checkbox"
                    checked={editActive}
                    onChange={(e) => setEditActive(e.target.checked)}
                  />
                  <span>Event Aktif</span>
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-slate-700">
                  <input
                    type="checkbox"
                    checked={editBlind}
                    onChange={(e) => setEditBlind(e.target.checked)}
                  />
                  <span>Blind Mode (Sembunyikan Suara)</span>
                </label>
              </div>

              {editError && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-700">
                  {editError}
                </div>
              )}

              <div className="flex flex-wrap justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingEvent(null)}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={savingSettings}
                  className="rounded-xl bg-gradient-to-r from-[#1C3458] to-[#0E7490] px-5 py-2.5 text-xs font-semibold text-white transition hover:from-[#152845] hover:to-[#0891B2] disabled:opacity-60"
                >
                  {savingSettings ? "Menyimpan..." : "Simpan Pengaturan"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Event Confirmation Modal */}
      {deletingEvent && (() => {
        const totalVotes = deletingEvent.candidates.reduce(
          (sum, c) => sum + c.totalVotes,
          0
        );
        const requiresSlugConfirm = totalVotes > 0;
        const canSubmitDelete =
          !deletingBusy &&
          (!requiresSlugConfirm ||
            deleteConfirmSlug.trim() === deletingEvent.slug);

        return (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 p-0 backdrop-blur-xs sm:items-center sm:p-4">
            <div className="max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:max-w-lg sm:rounded-3xl sm:p-6">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-rose-100 text-rose-600">
                    <AlertTriangle className="h-5 w-5" />
                  </div>
                  <div>
                    <span className="text-xs font-bold uppercase tracking-wider text-rose-600">
                      Hapus Event Permanen
                    </span>
                    <h2 className="mt-0.5 text-lg font-bold text-slate-900">
                      {deletingEvent.title}
                    </h2>
                    <p className="font-mono text-xs text-slate-500">
                      /events/{deletingEvent.slug}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setDeletingEvent(null)}
                  disabled={deletingBusy}
                  className="rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                  aria-label="Tutup konfirmasi hapus"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <form onSubmit={handleDeleteEvent} className="mt-5 space-y-4">
                <div className="rounded-2xl border border-rose-200 bg-rose-50/70 p-4 text-xs text-rose-900">
                  <p className="font-semibold">
                    Tindakan ini tidak dapat dibatalkan.
                  </p>
                  <p className="mt-1 leading-relaxed text-rose-800">
                    Seluruh data kandidat ({deletingEvent.candidates.length}{" "}
                    kandidat), pesanan vote, catatan suara sah ({totalVotes}{" "}
                    suara), dan bukti pembayaran manual milik event ini akan
                    dihapus permanen.
                  </p>
                </div>

                {requiresSlugConfirm && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-700">
                      Event ini sudah memiliki{" "}
                      <span className="font-bold text-rose-700">
                        {totalVotes} suara sah
                      </span>
                      . Ketik slug{" "}
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-slate-900">
                        {deletingEvent.slug}
                      </span>{" "}
                      untuk konfirmasi:
                    </label>
                    <input
                      type="text"
                      required
                      value={deleteConfirmSlug}
                      onChange={(e) => setDeleteConfirmSlug(e.target.value)}
                      placeholder={deletingEvent.slug}
                      className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2 font-mono text-xs focus:border-rose-500 focus:outline-none"
                    />
                  </div>
                )}

                {deleteError && (
                  <div className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-700">
                    {deleteError}
                  </div>
                )}

                <div className="flex flex-wrap justify-end gap-2 pt-2">
                  <button
                    type="button"
                    disabled={deletingBusy}
                    onClick={() => setDeletingEvent(null)}
                    className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={!canSubmitDelete}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 px-5 py-2.5 text-xs font-semibold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:bg-rose-300"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>
                      {deletingBusy ? "Menghapus..." : "Hapus Permanen"}
                    </span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        );
      })()}

      {/* Print Document Event Selector Modal */}
      {showPrintModal && (() => {
        const selectedPrintEvent =
          data.events.find((ev) => ev.id === printEventId) ?? null;
        const selectedTotalVotes = selectedPrintEvent
          ? selectedPrintEvent.candidates.reduce(
              (sum, c) => sum + c.totalVotes,
              0
            )
          : 0;

        return (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 p-0 backdrop-blur-xs sm:items-center sm:p-4">
            <div className="max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:max-w-lg sm:rounded-3xl sm:p-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <span className="text-xs font-bold uppercase tracking-wider text-cyan-700">
                    Cetak Dokumen Event
                  </span>
                  <h2 className="mt-0.5 text-lg font-bold text-slate-900">
                    Pilih Event untuk Dicetak
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => setShowPrintModal(false)}
                  className="rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                  aria-label="Tutup pilihan cetak"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <form onSubmit={handleOpenPrintDocument} className="mt-5 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Event
                  </label>
                  <select
                    required
                    value={printEventId}
                    onChange={(e) => setPrintEventId(e.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-xs font-medium text-slate-800 focus:border-cyan-600 focus:outline-none"
                  >
                    {data.events.map((ev) => {
                      const votes = ev.candidates.reduce(
                        (s, c) => s + c.totalVotes,
                        0
                      );
                      return (
                        <option key={ev.id} value={ev.id}>
                          {ev.title} ({ev.slug}) —{" "}
                          {ev.isActive ? "Aktif" : "Nonaktif"} • {votes} suara
                        </option>
                      );
                    })}
                  </select>
                </div>

                {selectedPrintEvent && (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs">
                    <div className="font-bold text-slate-900">
                      {selectedPrintEvent.title}
                    </div>
                    <div className="mt-1 space-y-1 text-slate-600">
                      <div>
                        Periode: {formatDateTimeId(selectedPrintEvent.startsAt)}{" "}
                        – {formatDateTimeId(selectedPrintEvent.endsAt)}
                      </div>
                      <div>
                        Kandidat: {selectedPrintEvent.candidates.length} • Total
                        Suara Sah:{" "}
                        <span className="font-semibold text-slate-900">
                          {selectedTotalVotes}
                        </span>
                      </div>
                      <div>
                        Harga per Vote:{" "}
                        {formatRupiah(selectedPrintEvent.pricePerVote)}
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex flex-wrap justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowPrintModal(false)}
                    className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={!printEventId}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#1C3458] to-[#0E7490] px-5 py-2.5 text-xs font-semibold text-white transition hover:from-[#152845] hover:to-[#0891B2] disabled:opacity-50"
                  >
                    <Printer className="h-3.5 w-3.5" />
                    <span>Buka &amp; Cetak Dokumen</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
