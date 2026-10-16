import React, { useEffect, useId, useState } from "react";

export default function GuestPicker({
  guests,
  value,
  onChange,
  label = "Guest",
}) {
  const id = useId();
  const selected = guests.find((g) => g.id === value);
  const textFor = (g) =>
    `${g.name}${g.table_no ? ` · Table ${Number.isInteger(Number(g.table_no)) ? Number(g.table_no) : g.table_no}` : ""}`;
  const [query, setQuery] = useState(selected ? textFor(selected) : "");
  useEffect(() => {
    if (selected) setQuery(textFor(selected));
  }, [value]);
  const [open, setOpen] = useState(false),
    [active, setActive] = useState(0);
  const matches = guests
    .filter(
      (g) =>
        !query ||
        (selected && query === textFor(selected)) ||
        `${g.name} ${g.table_no} ${g.guest_of} ${g.remarks}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    )
    .slice(0, 8);
  const choose = (guest) => {
    onChange(guest.id);
    setQuery(textFor(guest));
    setOpen(false);
  };
  return (
    <div className="guest-picker">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        role="combobox"
        autoComplete="off"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        aria-autocomplete="list"
        aria-activedescendant={
          open && matches[active] ? `${id}-${active}` : undefined
        }
        placeholder="Search name, table or relationship"
        value={query}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onChange={(e) => {
          setQuery(e.target.value);
          onChange("");
          setOpen(true);
          setActive(0);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
            setActive((i) => Math.min(i + 1, matches.length - 1));
          }
          if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((i) => Math.max(0, i - 1));
          }
          if (e.key === "Enter" && open && matches[active]) {
            e.preventDefault();
            choose(matches[active]);
          }
          if (e.key === "Escape") setOpen(false);
        }}
      />
      {selected && (
        <small className="guest-detail">
          {[selected.guest_of, selected.remarks].filter(Boolean).join(" · ") ||
            "Registered wedding guest"}
        </small>
      )}
      {open && (
        <div className="guest-options" role="listbox" id={`${id}-list`}>
          {matches.map((g, i) => (
            <button
              type="button"
              id={`${id}-${i}`}
              key={g.id}
              role="option"
              aria-selected={g.id === value}
              className={i === active ? "active" : ""}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(g)}
            >
              <strong>{textFor(g)}</strong>
              <small>
                {[g.guest_of, g.remarks].filter(Boolean).join(" · ")}
              </small>
            </button>
          ))}
          {!matches.length && <p>No matching registered guest.</p>}
        </div>
      )}
    </div>
  );
}
