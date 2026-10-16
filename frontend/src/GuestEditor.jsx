import React, { useId, useRef, useState } from "react";
import { Check, LoaderCircle } from "lucide-react";
import { Button, Modal } from "./ui";

export default function GuestEditor({
  guest,
  relationships,
  onSave,
  onClose,
  busy,
  dirtyRef,
}) {
  const requestId = useRef(crypto.randomUUID());
  const relationshipList = useId();
  const [name, setName] = useState(guest?.name || "");
  const [relationship, setRelationship] = useState(guest?.guest_of || "");
  const [table, setTable] = useState(
    guest?.table_no ? String(Number(guest.table_no)) : "",
  );
  const markChanged = (setter) => (event) => {
    dirtyRef.current = true;
    setter(event.target.value);
  };
  const validTable =
    table === "" ||
    (/^\d+$/.test(table) && Number(table) >= 1 && Number(table) <= 9999);

  return (
    <Modal title={guest ? "Edit guest" : "New guest"} onClose={onClose}>
      <p className="muted">
        {guest
          ? "Changes keep this guest’s existing purchases and ticket numbers linked."
          : "Add a guest to the raffle desk. You can record their payment afterwards."}
      </p>
      <form
        className="guest-editor"
        onSubmit={(event) => {
          event.preventDefault();
          if (busy || !name.trim() || !validTable) return;
          onSave(
            {
              name: name.trim(),
              guest_of: relationship.trim(),
              table_no: table === "" ? null : Number(table),
            },
            requestId.current,
          );
        }}
      >
        <label>
          Guest name
          <input
            autoFocus
            required
            maxLength={200}
            value={name}
            onChange={markChanged(setName)}
            autoComplete="off"
          />
        </label>
        <label>
          Guest of / relationship
          <input
            list={relationshipList}
            maxLength={200}
            value={relationship}
            onChange={markChanged(setRelationship)}
            placeholder="e.g. Bride’s friend"
          />
          <datalist id={relationshipList}>
            {relationships.map((value) => (
              <option key={value} value={value} />
            ))}
          </datalist>
        </label>
        <label>
          Table number <span className="optional">optional</span>
          <input
            type="number"
            min="1"
            max="9999"
            step="1"
            inputMode="numeric"
            value={table}
            onChange={markChanged(setTable)}
            placeholder="Unassigned"
          />
        </label>
        <div className="modal-actions">
          <Button type="button" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={busy || !name.trim() || !validTable}
          >
            {busy ? (
              <LoaderCircle className="spin" size={16} />
            ) : (
              <Check size={16} />
            )}
            Save guest
          </Button>
        </div>
      </form>
    </Modal>
  );
}
