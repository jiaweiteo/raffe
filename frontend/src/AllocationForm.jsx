import React, { useEffect, useState } from "react";
import {
  ArrowUpRight,
  Check,
  CheckCircle2,
  CircleAlert,
  LoaderCircle,
  Plus,
  Ticket,
  X,
} from "lucide-react";
import { Badge, Button } from "./ui";
import GuestPicker from "./GuestPicker";
import {
  FIRST,
  LAST,
  prefillTicketRows,
  ticketFromSuffix,
} from "./ticketNumbers";
import { centsFrom, wholeFrom, money, dateTime, mailLink } from "./format";
import { post } from "./api";

export default function AllocationForm({
  payment,
  guests,
  occupiedRanges = [],
  act,
  busy,
  dirtyRef,
  onConfirmed,
  onIgnore,
  paymentFields,
  onSubmitPurchase,
}) {
  const [rows, setRows] = useState(() =>
    prefillTicketRows(
      [
        {
          key: crypto.randomUUID(),
          guest_id: "",
          amount: (payment.amount_cents / 100).toFixed(2),
          count: String(payment.ticket_entitlement || ""),
          first: "",
          autoFirst: true,
        },
      ],
      occupiedRanges,
    ),
  );
  const rangesKey = JSON.stringify(occupiedRanges);
  useEffect(() => {
    setRows((current) => prefillTicketRows(current, occupiedRanges));
  }, [rangesKey]);
  useEffect(() => {
    if (!onSubmitPurchase) return;
    // A single buyer receives the whole transfer. Group splits remain under staff control.
    setRows((current) =>
      prefillTicketRows(
        current.length === 1
          ? [
              {
                ...current[0],
                amount:
                  payment.amount_cents > 0
                    ? (payment.amount_cents / 100).toFixed(2)
                    : "",
                count: String(payment.ticket_entitlement || ""),
              },
            ]
          : current,
        occupiedRanges,
      ),
    );
    setVerified(false);
  }, [payment.amount_cents, payment.ticket_entitlement]);
  const [verified, setVerified] = useState(false),
    [duplicateAck, setDuplicateAck] = useState(false);
  const change = (key, field, value) => {
    dirtyRef.current = true;
    setRows((rows) =>
      prefillTicketRows(
        rows.map((r) =>
          r.key === key
            ? {
                ...r,
                [field]: value,
                ...(field === "first" ? { autoFirst: false } : {}),
              }
            : r,
        ),
        occupiedRanges,
      ),
    );
  };
  const allocatedCents = rows.reduce(
    (sum, r) =>
      sum + (Number.isFinite(centsFrom(r.amount)) ? centsFrom(r.amount) : 0),
    0,
  );
  const allocatedCount = rows.reduce(
    (sum, r) => sum + (wholeFrom(r.count) || 0),
    0,
  );
  const validRows = rows.every(
    (r) =>
      guests.some((guest) => guest.id === r.guest_id) &&
      Number.isFinite(centsFrom(r.amount)) &&
      wholeFrom(r.count) > 0 &&
      ticketFromSuffix(r.first) >= FIRST &&
      ticketFromSuffix(r.first) + wholeFrom(r.count) - 1 <= LAST,
  );
  const reconciled =
    allocatedCents === payment.amount_cents &&
    allocatedCount === payment.ticket_entitlement;
  const confirm = (e) => {
    e.preventDefault();
    act(async () => {
      const allocation = {
        verified,
        duplicate_ack: duplicateAck,
        allocations: rows.map((r) => ({
          guest_id: r.guest_id,
          amount_cents: centsFrom(r.amount),
          count: wholeFrom(r.count),
          first_ticket: ticketFromSuffix(r.first),
        })),
      };
      if (onSubmitPurchase) await onSubmitPurchase(allocation);
      else await post(`/payments/${payment.id}/confirm`, allocation);
      dirtyRef.current = false;
      onConfirmed();
    }, "Purchase confirmed. The pot and ticket records are updated.");
  };
  return (
    <form onSubmit={confirm} className="allocation-form">
      {paymentFields || (
        <div className="payment-focus">
          <span className="eyebrow">PAYMENT TO MATCH</span>
          <div className="payment-amount">
            {money(payment.amount_cents)}{" "}
            <Badge tone="gold">
              {payment.ticket_entitlement ?? "—"} entries
            </Badge>
          </div>
          <div className="muted small">
            {payment.source === "manual"
              ? "Manually recorded"
              : dateTime(payment.bank_time)}
            <span className="dot-separator">·</span>
            {payment.id}
          </div>
          {payment.note && <p className="payment-note">{payment.note}</p>}
          {mailLink(payment.source_link) && (
            <a
              className="text-button small"
              href={mailLink(payment.source_link)}
              target="_blank"
              rel="noreferrer"
            >
              Open bank alert
              <ArrowUpRight size={13} />
            </a>
          )}
        </div>
      )}
      {payment.amount_error && (
        <div className="notice warning">
          <CircleAlert size={18} />
          <span>{payment.amount_error}</span>
        </div>
      )}
      {payment.possible_duplicates.length > 0 && (
        <div className="notice warning column">
          <strong>Similar transfer detected</strong>
          <span>
            Same amount, bank time and account as{" "}
            {payment.possible_duplicates.join(", ")}. Verify whether this is a
            separate transfer.
          </span>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={duplicateAck}
              onChange={(e) => {
                setDuplicateAck(e.target.checked);
                dirtyRef.current = true;
              }}
            />
            I checked that this is a separate payment.
          </label>
        </div>
      )}
      <div className="section-heading">
        <h3>Who bought the tickets?</h3>
        <span>{rows.length > 1 ? "Group purchase" : "Guest allocation"}</span>
      </div>
      {rows.map((row, index) => (
        <div className="allocation" key={row.key}>
          <div className="allocation-top">
            <span>GUEST {String(index + 1).padStart(2, "0")}</span>
            {rows.length > 1 && (
              <button
                type="button"
                className="icon-button"
                aria-label={`Remove guest ${index + 1}`}
                onClick={() => {
                  dirtyRef.current = true;
                  setRows((current) =>
                    prefillTicketRows(
                      current.filter((r) => r.key !== row.key),
                      occupiedRanges,
                    ),
                  );
                }}
              >
                <X size={16} />
              </button>
            )}
          </div>
          <GuestPicker
            guests={guests}
            value={row.guest_id}
            onChange={(value) => change(row.key, "guest_id", value)}
          />
          <div className="form-grid">
            <label>
              Share (SGD)
              <input
                aria-label={`Guest ${index + 1} amount`}
                inputMode="decimal"
                value={row.amount}
                onChange={(e) => change(row.key, "amount", e.target.value)}
              />
            </label>
            <label>
              Tickets
              <input
                aria-label={`Guest ${index + 1} ticket count`}
                inputMode="numeric"
                value={row.count}
                onChange={(e) => change(row.key, "count", e.target.value)}
              />
            </label>
          </div>
          <label>
            First physical ticket number
            <div className="ticket-number-input">
              <span aria-hidden="true">5200</span>
              <input
                aria-label={`Guest ${index + 1} first ticket`}
                aria-describedby={`ticket-hint-${row.key}`}
                inputMode="numeric"
                pattern="[0-9]{1,4}"
                maxLength={4}
                autoComplete="off"
                placeholder="0001"
                value={row.first}
                onChange={(e) => {
                  if (/^\d{0,4}$/.test(e.target.value))
                    change(row.key, "first", e.target.value);
                }}
              />
            </div>
            <small className="ticket-input-hint" id={`ticket-hint-${row.key}`}>
              Next available range is prefilled. Change the last four digits if
              needed.
            </small>
          </label>
          <div className="range-preview">
            <Ticket size={14} />
            {Number.isFinite(ticketFromSuffix(row.first)) &&
            wholeFrom(row.count) > 0
              ? `${ticketFromSuffix(row.first)} – ${ticketFromSuffix(row.first) + wholeFrom(row.count) - 1}`
              : "Your full ticket range will appear here"}
          </div>
        </div>
      ))}
      <button
        type="button"
        className="text-button add-guest"
        onClick={() => {
          dirtyRef.current = true;
          setRows((current) =>
            prefillTicketRows(
              [
                ...current,
                {
                  key: crypto.randomUUID(),
                  guest_id: "",
                  amount: (
                    Math.max(0, payment.amount_cents - allocatedCents) / 100
                  ).toFixed(2),
                  count:
                    payment.ticket_entitlement > allocatedCount
                      ? String(payment.ticket_entitlement - allocatedCount)
                      : "",
                  first: "",
                  autoFirst: true,
                },
              ],
              occupiedRanges,
            ),
          );
        }}
      >
        <Plus size={16} />
        Split with another guest
      </button>
      <div className={`reconcile ${reconciled ? "complete" : ""}`}>
        <div>
          <span>Allocated amount</span>
          <strong>
            {money(allocatedCents)} <em>/ {money(payment.amount_cents)}</em>
          </strong>
        </div>
        <div>
          <span>Allocated tickets</span>
          <strong>
            {allocatedCount} <em>/ {payment.ticket_entitlement ?? "—"}</em>
          </strong>
        </div>
        {reconciled && <CheckCircle2 size={18} />}
      </div>
      <label className="checkbox verify">
        <input
          type="checkbox"
          checked={verified}
          onChange={(e) => {
            setVerified(e.target.checked);
            dirtyRef.current = true;
          }}
        />
        <span>
          I verified the transfer, the buyers and the physical ticket ranges.
        </span>
      </label>
      <Button
        variant="primary full"
        disabled={
          busy ||
          !!payment.amount_error ||
          !validRows ||
          !reconciled ||
          !verified ||
          (payment.possible_duplicates.length > 0 && !duplicateAck)
        }
      >
        {busy ? (
          <LoaderCircle className="spin" size={17} />
        ) : (
          <Check size={17} />
        )}
        Confirm purchase
      </Button>
      {onIgnore && (
        <button
          type="button"
          className="text-button muted ignore"
          onClick={onIgnore}
        >
          Ignore this payment…
        </button>
      )}
    </form>
  );
}
