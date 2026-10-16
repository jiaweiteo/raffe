import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Clover,
  Download,
  Expand,
  FileSpreadsheet,
  History,
  Inbox,
  Leaf,
  LoaderCircle,
  Mail,
  Plus,
  RefreshCw,
  Settings2,
  ShieldCheck,
  Sparkles,
  Ticket,
  Trash2,
  Trophy,
  Users,
  X,
} from "lucide-react";
import "./styles.css";

import AuditPage from "./AuditPage";
import GuestList from "./GuestList";
import GuestEditor from "./GuestEditor";
import { Button, Badge, Empty, Modal } from "./ui";
import AuthGate, { SignOut } from "./cloudAuth";
import { money, integer, time, dateTime, mailLink } from "./format";
import { api, post, loadAuditReports } from "./api";
import GuestPicker from "./GuestPicker";
import AllocationForm from "./AllocationForm";
import ManualModal from "./ManualModal";
import SettingsPage from "./SettingsPage";

function PaymentDetail({ payment, guests, act, busy, onClose }) {
  const [mode, setMode] = useState("view"),
    [reason, setReason] = useState(""),
    [checked, setChecked] = useState(false),
    [allocationId, setAllocationId] = useState(""),
    [guestId, setGuestId] = useState("");
  return (
    <Modal
      title={money(payment.amount_cents) + " payment"}
      eyebrow={payment.id}
      onClose={onClose}
      wide
    >
      <div className="detail-meta">
        <Badge tone={payment.status === "confirmed" ? "green" : "gold"}>
          {payment.status}
        </Badge>
        <span>{dateTime(payment.confirmed_at || payment.created_at)}</span>
      </div>
      <div className="detail-allocations">
        {payment.allocations.map((a) => (
          <div key={a.id}>
            <div>
              <strong>{a.name}</strong>
              <small>
                Table {a.table_no || "—"} · {a.first_ticket}–
                {a.first_ticket + a.count - 1}
              </small>
            </div>
            <div>
              <strong>{a.count} tickets</strong>
              <small>{money(a.amount_cents)}</small>
            </div>
            {payment.status === "confirmed" && (
              <button
                className="text-button"
                onClick={() => {
                  setMode("reassign");
                  setAllocationId(a.id);
                  setGuestId(a.guest_id);
                  setReason("");
                }}
              >
                Change guest
              </button>
            )}
          </div>
        ))}
      </div>
      {payment.note && <p className="notice">{payment.note}</p>}
      {mode === "reassign" && (
        <div className="correction-box">
          <h3>Correct the guest</h3>
          <GuestPicker guests={guests} value={guestId} onChange={setGuestId} />
          <label>
            Reason
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why is this guest being changed?"
            />
          </label>
          <Button
            variant="primary"
            disabled={busy || !guestId || reason.trim().length < 3}
            onClick={() =>
              act(async () => {
                await api(
                  `/payments/${payment.id}/allocations/${allocationId}`,
                  { method: "PATCH", body: { guest_id: guestId, reason } },
                );
                onClose();
              }, "Guest corrected. Ticket numbers and payment amount are unchanged.")
            }
          >
            Save correction
          </Button>
        </div>
      )}
      {mode === "reverse" && (
        <div className="correction-box">
          <div className="notice warning">
            <CircleAlert size={20} />
            <span>
              Reversing removes this payment from the pot and voids all its
              tickets. Remove the physical draw stubs. These numbers cannot be
              resold. This does not send a bank refund.
            </span>
          </div>
          <label>
            Reason
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Explain the reversal"
            />
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
            />
            I will remove all affected physical stubs from the draw.
          </label>
          <Button
            variant="danger"
            disabled={busy || !checked || reason.trim().length < 3}
            onClick={() =>
              act(async () => {
                await post(`/payments/${payment.id}/reverse`, { reason });
                onClose();
              }, "Payment reversed. Remove its physical draw stubs; those numbers are permanently void.")
            }
          >
            Reverse and void tickets
          </Button>
        </div>
      )}
      <div className="modal-actions">
        {payment.status === "confirmed" && mode === "view" && (
          <button
            className="text-button danger-text"
            onClick={() => {
              setMode("reverse");
              setReason("");
            }}
          >
            Reverse payment…
          </button>
        )}
        <Button onClick={onClose}>Close</Button>
      </div>
    </Modal>
  );
}

function PrizeCards({ summary, large = false }) {
  const labels = [
    "First prize",
    "Second prize",
    "Third prize",
    "Fourth prize",
    "Fifth prize",
  ];
  return (
    <div className={`prize-cards ${large ? "large" : ""}`}>
      {summary.prizes_cents.map((cents, index) => (
        <div className={`prize-card prize-${index + 1}`} key={index}>
          <div className="prize-label">
            {index === 0 ? (
              <Trophy size={17} />
            ) : (
              <span className="prize-index">0{index + 1}</span>
            )}
            <span>{labels[index]}</span>
          </div>
          <strong>{money(cents)}</strong>
        </div>
      ))}
    </div>
  );
}

function Admin({ cloud = false }) {
  const [data, setData] = useState(null),
    [error, setError] = useState(""),
    [online, setOnline] = useState(true),
    [page, setPage] = useState("inbox"),
    [filter, setFilter] = useState("pending"),
    [selectedId, setSelectedId] = useState(null),
    [search, setSearch] = useState(""),
    [modal, setModal] = useState(null),
    [busy, setBusy] = useState(false),
    [toast, setToast] = useState(null);
  const dirtyRef = useRef(false),
    seen = useRef(new Set()),
    loaded = useRef(false),
    refreshing = useRef(false);
  const refresh = async () => {
    if (refreshing.current) return;
    refreshing.current = true;
    try {
      const next = await api("/state");
      setData(next);
      setOnline(true);
      setError("");
      const pending = next.payments.filter((p) => p.status === "pending");
      const newItems = pending.filter((p) => !seen.current.has(p.id));
      seen.current = new Set(pending.map((p) => p.id));
      if (newItems.length && !dirtyRef.current) {
        setPage("inbox");
        setFilter("pending");
        setSelectedId(newItems[0].id);
      }
      loaded.current = true;
    } catch (e) {
      setOnline(false);
      if (!loaded.current) setError(e.message);
    } finally {
      refreshing.current = false;
    }
  };
  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 5000);
    return () => clearInterval(interval);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(
      () => setToast(null),
      toast.type === "error" ? 12000 : 6500,
    );
    return () => clearTimeout(timer);
  }, [toast]);
  const act = async (fn, message) => {
    setBusy(true);
    try {
      await fn();
      await refresh();
      if (message) setToast({ type: "success", text: message });
    } catch (e) {
      setToast({ type: "error", text: e.message });
    } finally {
      setBusy(false);
    }
  };
  const leave = (action) => {
    if (dirtyRef.current && !window.confirm("Discard the unsaved changes?"))
      return;
    dirtyRef.current = false;
    action();
  };
  const download = () =>
    act(async () => {
      const blob = await api("/excel/download", { blob: true });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "Registration and Raffle List - Live.xlsx";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, "Downloaded the current Excel copy.");
  if (!data)
    return (
      <div className="loading-screen">
        <Clover size={36} />
        <h1>The Wedding Raffle</h1>
        {error ? (
          <>
            <p>{error}</p>
            <Button onClick={refresh}>Try again</Button>
            {cloud && <SignOut />}
          </>
        ) : (
          <>
            <LoaderCircle className="spin" />
            <p>Preparing your raffle desk…</p>
          </>
        )}
      </div>
    );
  const { summary: s, settings, guests, payments } = data;
  const pending = payments.filter((p) => p.status === "pending");
  const selected = payments.find(
    (p) => p.id === selectedId && p.status === "pending",
  );
  const filtered = payments.filter(
    (p) =>
      (filter === "all" || p.status === filter) &&
      (!search ||
        `${p.id} ${p.amount_cents / 100} ${p.allocations.map((a) => a.name).join(" ")}`
          .toLowerCase()
          .includes(search.toLowerCase())),
  );
  const nav = [
    ["inbox", Inbox, "Payment inbox", pending.length],
    ["guests", Users, "Guest list"],
    ["prizes", Trophy, "Prize breakdown"],
    ["audit", History, "Audit"],
    ["settings", Settings2, "Settings"],
  ];
  const sourceName = (p) =>
    ({
      outlook: "Outlook alert",
      manual: "Manual entry",
      pasted_email: "Pasted alert",
    })[p.source] || p.source;
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="/admin">
          <span className="brand-mark">
            <Clover size={26} />
          </span>
          <span>
            The Wedding<span>RAFFLE DESK</span>
          </span>
        </a>
        <div className="sidebar-label">YOUR CELEBRATION</div>
        <nav>
          {nav.map(([id, Icon, label, count]) => (
            <button
              key={id}
              aria-label={label}
              className={`nav-item ${page === id ? "active" : ""}`}
              onClick={() =>
                leave(() => {
                  setPage(id);
                  setSearch("");
                })
              }
            >
              <Icon size={19} />
              <span>{label}</span>
              {count > 0 && <span className="nav-count">{count}</span>}
            </button>
          ))}
        </nav>
        <a
          className="display-nav"
          href="/display"
          target="_blank"
          rel="noreferrer"
        >
          <Expand size={18} />
          <span>Live display</span>
          <ArrowUpRight size={16} />
        </a>
        <div className="sidebar-bottom">
          <div className="local-badge">
            <ShieldCheck size={15} />
            {settings.cloud ? "CLOUD · ADMIN ONLY" : "LOCAL & PRIVATE"}
          </div>
          {settings.cloud && <SignOut />}
          <div className="inventory-note">
            <Ticket size={19} />
            <div>
              <strong>1,500 little chances</strong>
              <span>52000001 — 52001500</span>
            </div>
          </div>
          <p>
            Made for a day to remember.
            <br />A little luck goes a long way.
          </p>
          <Leaf size={30} strokeWidth={1} />
        </div>
      </aside>
      <main className="main">
        <header className="page-header">
          <div>
            <p className="eyebrow">A LITTLE LUCK. A LOT OF LOVE.</p>
            <h1>
              {page === "inbox"
                ? "Your raffle, beautifully in order."
                : page === "guests"
                  ? "Everyone on the guest list."
                  : page === "prizes"
                    ? "Five reasons to feel lucky."
                    : page === "audit"
                      ? "Every detail, accounted for."
                      : "Ready for the big day."}
            </h1>
            <p className="muted">
              {page === "inbox"
                ? "Match a payment. Hand over the tickets. Watch the pot grow."
                : page === "guests"
                  ? `${guests.length} registered guests · searchable by name, table or relationship`
                  : page === "prizes"
                    ? "Every confirmed contribution goes into the prize pool."
                    : page === "audit"
                      ? "Payments, physical tickets and the history behind every change."
                      : settings.cloud
                        ? "Your event display and cloud records."
                        : "Your event, email connection and local records."}
            </p>
          </div>
          <a
            className="button header-display"
            href="/display"
            target="_blank"
            rel="noreferrer"
          >
            <Expand size={16} />
            Open live display
            <ArrowUpRight size={15} />
          </a>
        </header>
        <div className="system-bar">
          <span>
            <i className={`status-dot ${online ? "" : "amber"}`} />
            {online
              ? settings.cloud
                ? "Cloud app connected"
                : "Local app connected"
              : "Disconnected · showing saved view"}
          </span>
          <span>
            <Mail size={14} />
            {settings.cloud
              ? "Manual payment intake"
              : settings.mail_enabled
                ? "Outlook connected"
                : "Outlook not connected"}
          </span>
          <button
            onClick={() =>
              settings.excel_pending
                ? act(() => post("/excel/retry"), "Retried Excel update.")
                : download()
            }
            className={settings.excel_pending ? "attention" : ""}
          >
            <FileSpreadsheet size={14} />
            {settings.cloud
              ? "Download current Excel"
              : settings.excel_pending
                ? "Excel update pending · retry"
                : "Excel up to date"}
            {settings.excel_pending && <RefreshCw size={12} />}
          </button>
        </div>
        {!online && (
          <div className="notice warning">
            <CircleAlert size={18} />
            <span>
              Check your connection to the app. Unconfirmed form changes stay in
              this tab; purchases need a server confirmation.
            </span>
          </div>
        )}
        {settings.excel_error && (
          <div className="notice warning">
            <CircleAlert size={18} />
            <span>{settings.excel_error}</span>
          </div>
        )}
        {data.backup_error && (
          <div className="notice warning">{data.backup_error}</div>
        )}
        {page === "inbox" && (
          <>
            <section className="overview">
              <div className="pot-card">
                <div className="pot-card-top">
                  <span className="eyebrow">THE PRIZE POOL</span>
                  <span className="light-badge">
                    <span className="status-dot" />
                    LIVE
                  </span>
                </div>
                <div className="pot-value">
                  <span>S</span>
                  {money(s.pot_cents)}
                </div>
                <p>Growing with every little bit of luck.</p>
                <div className="pot-card-footer">
                  <span>
                    <ShieldCheck size={14} />
                    Confirmed payments only
                  </span>
                  <span>
                    {s.updated_at
                      ? `Updated ${time(s.updated_at)}`
                      : "Ready for the first contribution"}
                  </span>
                </div>
                <Clover
                  className="pot-watermark"
                  size={200}
                  strokeWidth={0.6}
                />
              </div>
              <div className="stats-stack">
                <div className="stat-card">
                  <span className="stat-icon">
                    <Ticket size={21} />
                  </span>
                  <div>
                    <span>Tickets in the draw</span>
                    <strong>
                      {integer(s.sold)} <small>/ 1,500</small>
                    </strong>
                  </div>
                  <span className="stat-trend">{Math.round(s.sold / 15)}%</span>
                </div>
                <div className="stat-card">
                  <span className="stat-icon gold">
                    <Sparkles size={21} />
                  </span>
                  <div>
                    <span>Tickets available</span>
                    <strong>{integer(s.remaining)}</strong>
                  </div>
                  {s.voided > 0 && (
                    <span className="small muted">{s.voided} void</span>
                  )}
                </div>
                <div className="stat-card">
                  <span className="stat-icon cream">
                    <Inbox size={21} />
                  </span>
                  <div>
                    <span>Payments to match</span>
                    <strong>{pending.length}</strong>
                  </div>
                  <span className="small muted">
                    {pending.length ? "Ready for review" : "All caught up"}
                  </span>
                </div>
              </div>
            </section>
            <div className="prizes-heading">
              <span className="eyebrow">A LITTLE SOMETHING TO WIN</span>
              <span>
                {s.pot_cents < 160000
                  ? "Prizes grow together up to a $1,600 pool"
                  : "First prize takes the pot less $1,100"}
              </span>
            </div>
            <PrizeCards summary={s} />
            {!settings.cloud && !settings.mail_enabled && (
              <div className="connect-banner">
                <span className="connect-icon">
                  <Mail size={20} />
                </span>
                <div>
                  <strong>Your payment inbox, without the copy & paste.</strong>
                  <p>
                    Connect Outlook to queue incoming UOB alerts automatically.
                  </p>
                </div>
                <button
                  className="text-button"
                  onClick={() => leave(() => setPage("settings"))}
                >
                  Set up Outlook
                  <ArrowRight size={16} />
                </button>
              </div>
            )}
            {data.mail_issues.length > 0 && (
              <div className="panel mail-issues">
                <h3>
                  <CircleAlert size={18} /> {data.mail_issues.length} bank alert
                  {data.mail_issues.length > 1 ? "s" : ""} need manual review
                </h3>
                {data.mail_issues.map((issue) => (
                  <div key={issue.message_id}>
                    <p>
                      {issue.error} · {dateTime(issue.received_at)}
                    </p>
                    <div>
                      {mailLink(issue.source_link) && (
                        <a
                          className="text-button"
                          href={mailLink(issue.source_link)}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Open alert
                          <ArrowUpRight size={13} />
                        </a>
                      )}
                      <Button onClick={() => setModal({ type: "manual" })}>
                        Record manually
                      </Button>
                      <button
                        className="text-button"
                        onClick={() => {
                          const reason = window.prompt(
                            "After checking the alert, explain how it was resolved:",
                          );
                          if (reason?.trim().length >= 3)
                            act(
                              () =>
                                post(
                                  `/mail-issues/${encodeURIComponent(issue.message_id)}/resolve`,
                                  { reason },
                                ),
                              "Alert issue resolved.",
                            );
                        }}
                      >
                        Mark resolved…
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <section className="inbox-layout">
              <div className="panel inbox-panel">
                <div className="panel-heading">
                  <div>
                    <h2>
                      Payment inbox{" "}
                      <span className="heading-count">{pending.length}</span>
                    </h2>
                    <p>Every contribution starts here.</p>
                  </div>
                  <Button
                    variant="primary small-button"
                    onClick={() => setModal({ type: "manual" })}
                  >
                    <Plus size={16} />
                    Record payment
                  </Button>
                </div>
                <div className="inbox-tools">
                  <div className="tabs">
                    {[
                      ["pending", "To match"],
                      ["confirmed", "Confirmed"],
                      ["all", "All records"],
                    ].map(([id, label]) => (
                      <button
                        key={id}
                        className={filter === id ? "active" : ""}
                        onClick={() => setFilter(id)}
                      >
                        {label}
                        {id === "pending" && <span>{pending.length}</span>}
                      </button>
                    ))}
                  </div>
                  {filter !== "pending" && (
                    <input
                      className="search-input"
                      placeholder="Search payments or guests"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      aria-label="Search payments"
                    />
                  )}
                </div>
                {filtered.length === 0 ? (
                  <Empty
                    title={
                      filter === "pending"
                        ? "A quiet inbox. A lovely beginning."
                        : "No payments here yet."
                    }
                    icon={filter === "pending" ? Inbox : History}
                    action={
                      filter === "pending" ? (
                        <button
                          className="text-button"
                          onClick={() => setModal({ type: "manual" })}
                        >
                          Record your first payment
                          <ArrowRight size={15} />
                        </button>
                      ) : null
                    }
                  >
                    {filter === "pending"
                      ? settings.cloud
                        ? "Use Record payment to enter a transfer and allocate its tickets in one step. Existing pending payments can still be reviewed here."
                        : "Incoming bank alerts will appear here, ready to match to a guest. You can also record a transfer manually."
                      : "Confirmed purchases and their ticket ranges will appear here."}
                  </Empty>
                ) : (
                  <div className="payment-list">
                    {filtered.map((p) => (
                      <button
                        key={p.id}
                        className={`payment-row ${selectedId === p.id ? "selected" : ""}`}
                        onClick={() =>
                          p.status === "pending"
                            ? leave(() => setSelectedId(p.id))
                            : setModal({ type: "detail", id: p.id })
                        }
                      >
                        <span
                          className={`payment-row-icon ${p.status === "reversed" ? "void" : ""}`}
                        >
                          {p.status === "confirmed" ? (
                            <Check size={19} />
                          ) : (
                            <ArrowDownLeft size={19} />
                          )}
                        </span>
                        <div className="payment-row-main">
                          <strong>{money(p.amount_cents)}</strong>
                          <span>
                            {p.allocations.length
                              ? p.allocations.map((a) => a.name).join(", ")
                              : sourceName(p)}
                            {p.possible_duplicates.length > 0 &&
                              " · Check similar alert"}
                          </span>
                        </div>
                        <div className="payment-row-meta">
                          <Badge
                            tone={
                              p.status === "confirmed"
                                ? "green"
                                : p.status === "pending"
                                  ? "gold"
                                  : ""
                            }
                          >
                            {p.status === "pending"
                              ? `${p.ticket_entitlement ?? "—"} entries`
                              : p.status}
                          </Badge>
                          <small>{time(p.bank_time || p.created_at)}</small>
                        </div>
                        <ChevronRight size={16} />
                      </button>
                    ))}
                  </div>
                )}
                <div className="panel-footer">
                  <ShieldCheck size={14} />
                  Pending payments are not included in the prize pool.
                </div>
              </div>
            </section>
          </>
        )}
        {page === "guests" && (
          <GuestList
            guests={guests}
            busy={busy}
            onNew={() => leave(() => setModal({ type: "guest" }))}
            onEdit={(guest) => leave(() => setModal({ type: "guest", guest }))}
            onDelete={(guest) =>
              leave(() => setModal({ type: "delete-guest", guest }))
            }
          />
        )}
        {page === "prizes" && (
          <>
            <div className="prize-overview panel">
              <p className="eyebrow">THE CURRENT POOL</p>
              <h2>S{money(s.pot_cents)}</h2>
              <p>Five prizes. One unforgettable celebration.</p>
              <PrizeCards summary={s} large />
            </div>
            <div className="rules-grid">
              <section className="panel rule-panel">
                <Trophy size={24} />
                <h2>When the pot reaches $1,600</h2>
                <p>
                  First prize receives the pot minus $1,100. Second to fifth
                  prizes are $500, $300, $200 and $100.
                </p>
              </section>
              <section className="panel rule-panel">
                <Sparkles size={24} />
                <h2>While the pool is growing</h2>
                <p>
                  Below $1,600, prizes scale in the ratio 5 : 5 : 3 : 2 : 1.
                  First and second are equal. Every cent is allocated to a
                  prize.
                </p>
              </section>
            </div>
          </>
        )}
        {page === "audit" && (
          <AuditPage
            loadReports={loadAuditReports}
            onDownload={download}
            busy={busy}
            excelPending={settings.excel_pending}
          />
        )}
        {page === "settings" && (
          <SettingsPage settings={settings} act={act} busy={busy} />
        )}
        <footer className="main-footer">
          <span>
            <Clover size={14} />A little luck, thoughtfully kept.
          </span>
          <div>
            <button onClick={download}>
              <Download size={14} />
              Export Excel
            </button>
            <button
              onClick={() =>
                act(
                  async () => {
                    if (!settings.cloud) {
                      await post("/backups");
                      return;
                    }
                    const blob = await api("/backups", {
                      method: "POST",
                      blob: true,
                    });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = "raffle-backup.json";
                    a.click();
                    setTimeout(() => URL.revokeObjectURL(url), 1000);
                  },
                  settings.cloud
                    ? "Records backup downloaded."
                    : "Local database backup created.",
                )
              }
            >
              <ShieldCheck size={14} />
              Back up records
            </button>
          </div>
        </footer>
      </main>
      {page === "inbox" && selected && !modal && (
        <Modal
          title="Match payment"
          wide
          onClose={() => {
            if (!busy) leave(() => setSelectedId(null));
          }}
        >
          <AllocationForm
            key={selected.id}
            payment={selected}
            guests={guests}
            occupiedRanges={payments
              .filter((p) => ["confirmed", "reversed"].includes(p.status))
              .flatMap((p) =>
                p.allocations.map((a) => ({
                  first: a.first_ticket,
                  last: a.first_ticket + a.count - 1,
                })),
              )}
            act={act}
            busy={busy}
            dirtyRef={dirtyRef}
            onConfirmed={() => setSelectedId(null)}
            onIgnore={() => {
              const reason = window.prompt(
                "Why should this payment be ignored?",
              );
              if (reason?.trim().length >= 3)
                act(async () => {
                  await post(`/payments/${selected.id}/ignore`, {
                    reason,
                  });
                  dirtyRef.current = false;
                  setSelectedId(null);
                }, "Payment ignored. It remains in the audit history.");
            }}
          />
        </Modal>
      )}
      {modal?.type === "manual" && (
        <ManualModal
          onClose={() => {
            if (!busy) leave(() => setModal(null));
          }}
          act={act}
          busy={busy}
          guests={guests}
          dirtyRef={dirtyRef}
          occupiedRanges={payments
            .filter((p) => ["confirmed", "reversed"].includes(p.status))
            .flatMap((p) =>
              p.allocations.map((a) => ({
                first: a.first_ticket,
                last: a.first_ticket + a.count - 1,
              })),
            )}
          onConfirmed={() => setModal(null)}
        />
      )}
      {modal?.type === "guest" && (
        <GuestEditor
          guest={modal.guest}
          relationships={[
            ...new Set(guests.map((guest) => guest.guest_of).filter(Boolean)),
          ].sort()}
          busy={busy}
          dirtyRef={dirtyRef}
          onClose={() => {
            if (!busy) leave(() => setModal(null));
          }}
          onSave={(body, requestId) =>
            act(
              async () => {
                if (modal.guest)
                  await api(`/guests/${modal.guest.id}`, {
                    method: "PUT",
                    body,
                  });
                else await post("/guests", { ...body, request_id: requestId });
                dirtyRef.current = false;
                setModal(null);
              },
              modal.guest ? "Guest updated." : "Guest added.",
            )
          }
        />
      )}
      {modal?.type === "delete-guest" && (
        <Modal
          title="Delete guest?"
          onClose={() => {
            if (!busy) setModal(null);
          }}
        >
          <p className="guest-delete-copy">
            <strong>{modal.guest.name}</strong> will be removed from the guest
            list and future purchases. Their existing payments and tickets will
            stay in Audit and Excel. The pot will stay the same.
          </p>
          <div className="modal-actions">
            <Button disabled={busy} onClick={() => setModal(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              disabled={busy}
              onClick={() =>
                act(async () => {
                  await api(`/guests/${modal.guest.id}`, { method: "DELETE" });
                  setModal(null);
                }, "Guest deleted. Payment and ticket history preserved.")
              }
            >
              <Trash2 size={16} />
              Delete guest
            </Button>
          </div>
        </Modal>
      )}
      {modal?.type === "detail" && payments.find((p) => p.id === modal.id) && (
        <PaymentDetail
          payment={payments.find((p) => p.id === modal.id)}
          guests={guests}
          act={act}
          busy={busy}
          onClose={() => setModal(null)}
        />
      )}
      {toast && (
        <div
          className={`toast ${toast.type}`}
          role={toast.type === "error" ? "alert" : "status"}
        >
          {toast.type === "error" ? (
            <CircleAlert size={20} />
          ) : (
            <CheckCircle2 size={20} />
          )}
          <span>{toast.text}</span>
          <button
            className="icon-button"
            aria-label="Dismiss notification"
            onClick={() => setToast(null)}
          >
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
}

function LiveDisplay() {
  const [summary, setSummary] = useState(null),
    [connected, setConnected] = useState(false);
  useEffect(() => {
    document.title = "The Wedding Raffle · Live";
    let active = true,
      inFlight = false;
    const refresh = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const response = await fetch("/api/display");
        if (!response.ok) throw new Error();
        const value = await response.json();
        if (active) {
          setSummary(value);
          setConnected(true);
        }
      } catch {
        if (active) setConnected(false);
      } finally {
        inFlight = false;
      }
    };
    refresh();
    const timer = setInterval(refresh, 2000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);
  return (
    <main className="live-display">
      <div className="display-orbit orbit-one" />
      <div className="display-orbit orbit-two" />
      <button
        className="fullscreen-button icon-button"
        aria-label="Enter fullscreen"
        onClick={() =>
          document.fullscreenElement
            ? document.exitFullscreen()
            : document.documentElement.requestFullscreen()
        }
      >
        <Expand size={22} />
      </button>
      <div className="display-brand">
        <Leaf size={21} strokeWidth={1} />
        <span>THE WEDDING RAFFLE</span>
        <Leaf size={21} strokeWidth={1} />
      </div>
      <h1>{summary?.event_title || "A little luck. A lot of love."}</h1>
      <div className="display-flourish">
        <span />
        <Sparkles size={20} strokeWidth={1} />
        <span />
      </div>
      <p className="display-pool-label">OUR GROWING PRIZE POOL</p>
      <div className="display-pot">
        {summary ? (
          <>
            <span>S$</span>
            {new Intl.NumberFormat("en-SG", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            }).format(summary.pot_cents / 100)}
          </>
        ) : (
          <span className="display-loading">Preparing the celebration…</span>
        )}
      </div>
      <p className="display-subtitle">
        A little contribution. A chance at something wonderful.
      </p>
      {summary && (
        <>
          <div className="display-prizes">
            <PrizeCards summary={summary} large />
          </div>
          <div className="display-inventory">
            <span>
              <Ticket size={19} />
              <strong>{integer(summary.sold)}</strong> tickets in the draw
            </span>
            <i />
            <span>
              <strong>{integer(summary.remaining)}</strong> chances still
              waiting
            </span>
            {summary.voided > 0 && (
              <>
                <i />
                <span>{integer(summary.voided)} tickets voided</span>
              </>
            )}
          </div>
        </>
      )}
      <div className="display-bottom">
        <span className={`display-status ${connected ? "" : "offline"}`}>
          <span className={`status-dot ${connected ? "" : "amber"}`} />
          {connected
            ? "Live from the raffle desk"
            : summary
              ? "Reconnecting · showing last confirmed total"
              : "Waiting for the raffle desk"}
        </span>
        <span>
          {summary?.updated_at
            ? `Updated ${time(summary.updated_at)}`
            : "Five prizes. One lovely celebration."}
        </span>
      </div>
    </main>
  );
}

export { Admin, LiveDisplay, AllocationForm, ManualModal, GuestPicker };
const root = document.getElementById("root");
if (root)
  createRoot(root).render(
    location.pathname === "/display" ? (
      <LiveDisplay />
    ) : (
      <AuthGate>
        <Admin />
      </AuthGate>
    ),
  );
