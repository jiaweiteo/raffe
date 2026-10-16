import React, { useRef, useState } from "react";
import { Modal, Badge } from "./ui";
import AllocationForm from "./AllocationForm";
import { centsFrom } from "./format";
import { post } from "./api";

export default function ManualModal({
  onClose,
  onConfirmed,
  act,
  busy,
  guests = [],
  occupiedRanges = [],
  dirtyRef,
}) {
  const ownDirtyRef = useRef(false);
  const draftRef = dirtyRef || ownDirtyRef;
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const requestId = useRef(crypto.randomUUID());
  const amountCents = centsFrom(amount);
  const validAmount =
    Number.isSafeInteger(amountCents) &&
    amountCents > 0 &&
    amountCents <= 100_000_000 &&
    amountCents % 500 === 0;
  const fifties = Math.floor(amountCents / 5000);
  const remainder = amountCents % 5000;
  const entitlement = validAmount
    ? fifties * 15 + Math.floor(remainder / 2000) * 5 + (remainder % 2000) / 500
    : null;
  const payment = {
    amount_cents: Number.isFinite(amountCents) ? amountCents : 0,
    ticket_entitlement: entitlement,
    possible_duplicates: [],
    amount_error:
      amount && !validAmount
        ? "Enter a positive multiple of $5, up to $1,000,000."
        : null,
  };
  return (
    <Modal title="Record a payment" onClose={onClose} wide>
      <p className="muted">
        Enter the verified transfer and allocate its physical tickets in one
        step.
      </p>
      <AllocationForm
        payment={payment}
        guests={guests}
        occupiedRanges={occupiedRanges}
        act={act}
        busy={busy}
        dirtyRef={draftRef}
        onConfirmed={onConfirmed}
        onSubmitPurchase={(allocation) =>
          post("/purchases", {
            request_id: requestId.current,
            amount_cents: amountCents,
            note,
            verified: allocation.verified,
            allocations: allocation.allocations,
          })
        }
        paymentFields={
          <div className="manual-payment-fields">
            <div className="payment-entry-heading">
              <label>
                Payment amount (SGD)
                <div className="money-input">
                  <span>$</span>
                  <input
                    autoFocus
                    inputMode="decimal"
                    placeholder="50.00"
                    value={amount}
                    onChange={(e) => {
                      draftRef.current = true;
                      setAmount(e.target.value);
                    }}
                    required
                  />
                </div>
              </label>
              <Badge tone="gold">{entitlement ?? "—"} entries</Badge>
            </div>
            <p className="package-hint">
              $5 · 1 entry &nbsp; / &nbsp; $20 · 5 entries &nbsp; / &nbsp; $50 ·
              15 entries
            </p>
            <label>
              Note <span className="optional">optional</span>
              <input
                maxLength={1000}
                value={note}
                onChange={(e) => {
                  draftRef.current = true;
                  setNote(e.target.value);
                }}
                placeholder="Transfer reference or a note for your records"
              />
            </label>
          </div>
        }
      />
    </Modal>
  );
}
