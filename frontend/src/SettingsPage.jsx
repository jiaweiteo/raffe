import React, { useState } from "react";
import {
  ArrowUpRight,
  CircleAlert,
  Link2,
  Mail,
  Settings2,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import { Button, Badge } from "./ui";
import { api, post } from "./api";
import { time } from "./format";

export default function SettingsPage({ settings, act, busy }) {
  const toLocal = (iso) => {
    const date = new Date(iso);
    return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
  };
  const [form, setForm] = useState({
    ...settings,
    start_time: settings.cloud ? "" : toLocal(settings.start_time),
  });
  const field = (key, value) => setForm({ ...form, [key]: value });
  if (settings.cloud)
    return (
      <div className="settings-layout cloud-settings">
        <section className="panel settings-form">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">MAKE IT YOURS</p>
              <h2>Event settings</h2>
              <p>Personalise the title your guests see on the live display.</p>
            </div>
            <Settings2 size={22} />
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              act(
                () =>
                  api("/settings", {
                    method: "PATCH",
                    body: {
                      event_title: form.event_title,
                    },
                  }),
                "Event title saved.",
              );
            }}
          >
            <label>
              Live display title
              <input
                value={form.event_title}
                maxLength={100}
                onChange={(e) => field("event_title", e.target.value)}
                required
              />
            </label>
            <Button variant="primary" disabled={busy}>
              Save settings
            </Button>
          </form>
          <div className="connection-status">
            <ShieldCheck size={15} />
            <span>Changes are saved to your cloud raffle desk.</span>
          </div>
        </section>
        <aside className="panel settings-guide">
          <div className="settings-guide-icon">
            <Wallet size={23} />
          </div>
          <h3>Your raffle desk</h3>
          <p>
            Use <strong>Record payment</strong> to enter a verified transfer,
            select the guests and confirm their physical tickets in one step.
          </p>
          <div className="divider" />
          <h4>Records & backups</h4>
          <p>
            Purchases and audit history are saved in the cloud. Download the
            live Excel copy or a records backup from the footer before the
            event.
          </p>
          <p className="settings-footnote">
            Outlook intake is deferred. You can continue recording payments
            manually.
          </p>
        </aside>
      </div>
    );
  const save = (e) => {
    e.preventDefault();
    act(
      () =>
        api("/settings", {
          method: "PUT",
          body: {
            event_title: form.event_title,
            client_id: form.client_id.trim(),
            trusted_sender: form.trusted_sender.trim(),
            account_suffix: form.account_suffix,
            start_time: new Date(form.start_time).toISOString(),
          },
        }),
      "Settings saved. Connect Outlook to start or resume intake.",
    );
  };
  return (
    <div className="settings-layout">
      <section className="panel settings-form">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">MAKE IT YOURS</p>
            <h2>Event & email settings</h2>
          </div>
          <Settings2 size={22} />
        </div>
        <form onSubmit={save}>
          <label>
            Live display title
            <input
              value={form.event_title}
              maxLength={100}
              onChange={(e) => field("event_title", e.target.value)}
              required
            />
          </label>
          <div className="divider" />
          <h3>Outlook connection</h3>
          <p className="muted small">
            Personal Outlook or Hotmail. Your bank password is never needed.
          </p>
          <label>
            Microsoft application (client) ID
            <input
              value={form.client_id}
              onChange={(e) => field("client_id", e.target.value)}
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
            />
          </label>
          <label>
            Exact UOB sender email address
            <input
              type="email"
              value={form.trusted_sender}
              onChange={(e) => field("trusted_sender", e.target.value)}
              placeholder="Copy from a genuine UOB alert"
            />
          </label>
          <div className="form-grid">
            <label>
              Account’s last 4 digits
              <input
                inputMode="numeric"
                maxLength={4}
                value={form.account_suffix}
                onChange={(e) => field("account_suffix", e.target.value)}
              />
            </label>
            <label>
              Import alerts received since
              <input
                type="datetime-local"
                required
                value={form.start_time}
                onChange={(e) => field("start_time", e.target.value)}
              />
            </label>
          </div>
          <p className="muted small">
            Start time uses this laptop’s timezone. Only matching alerts in the
            Inbox are read; keep UOB alerts there.
          </p>
          <div className="notice">
            <ShieldCheck size={18} />
            <span>
              Microsoft grants mailbox-wide read permission. The app processes
              only the exact sender, subject, account suffix and start time
              above.
            </span>
          </div>
          <div className="settings-actions">
            <Button variant="primary" disabled={busy}>
              Save settings
            </Button>
            <Button
              type="button"
              disabled={busy}
              onClick={() =>
                act(
                  () => post("/outlook/connect"),
                  "Sign-in opened in your browser. Complete Microsoft consent there.",
                )
              }
            >
              <Link2 size={16} />
              Connect Outlook
            </Button>
            {settings.mail_enabled && (
              <button
                type="button"
                className="text-button"
                onClick={() =>
                  act(
                    () => post("/outlook/disconnect"),
                    "Outlook disconnected.",
                  )
                }
              >
                Disconnect
              </button>
            )}
          </div>
        </form>
        <div className="connection-status">
          <span
            className={`status-dot ${settings.mail_enabled ? "" : "amber"}`}
          />
          {settings.sync_status}
          {settings.mail_username && (
            <small>Mailbox: {settings.mail_username}</small>
          )}
          <small>Last successful sync: {time(settings.last_sync)}</small>
        </div>
      </section>
      <aside className="setup-guide panel">
        <div className="guide-icon">
          <Mail size={24} />
        </div>
        <h2>One-time email setup</h2>
        <p>
          Connect your own Microsoft app to keep this raffle entirely local.
        </p>
        <ol>
          <li>
            Register an app in Microsoft Entra. Choose support for{" "}
            <strong>personal Microsoft accounts</strong>.
          </li>
          <li>
            Add a <strong>Mobile and desktop</strong> redirect URI:{" "}
            <code>http://localhost</code>.
          </li>
          <li>
            Add Microsoft Graph <strong>delegated Mail.Read</strong> permission.
            Do not create a client secret.
          </li>
          <li>
            Copy the application ID here. Check a genuine alert for its exact
            sender and your account suffix.
          </li>
          <li>
            Save, connect, and sign in to the Outlook mailbox receiving the
            alerts. Allow Keychain access if prompted.
          </li>
        </ol>
        <a
          className="text-button"
          href="https://learn.microsoft.com/en-us/entra/identity-platform/quickstart-register-app"
          target="_blank"
          rel="noreferrer"
        >
          Microsoft registration guide <ArrowUpRight size={15} />
        </a>
        <div className="notice warning">
          <CircleAlert size={18} />
          <span>
            App registration requires access to an Entra tenant. A personal
            Outlook login alone may not provide it. If setup is unavailable,
            manual entry and pasted alerts work independently.
          </span>
        </div>
        <p className="small muted">
          Before the wedding, test actual $5, $20 and $50 alerts. Emails can be
          late or missing; verify purchases against your bank record.
        </p>
      </aside>
    </div>
  );
}
