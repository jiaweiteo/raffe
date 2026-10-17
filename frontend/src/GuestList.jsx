import React, { useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ShieldCheck,
  Users,
  Plus,
  Pencil,
  Trash2,
} from "lucide-react";
import { money } from "./format";

const compareText = new Intl.Collator("en-SG", {
  numeric: true,
  sensitivity: "base",
}).compare;
function tableNumber(value) {
  const text = String(value ?? "").trim();
  const number = Number(text);
  return text && Number.isFinite(number) && Number.isInteger(number)
    ? String(number)
    : text;
}

const columns = [
  { key: "name", label: "Guest" },
  { key: "relationship", label: "Guest of / relationship" },
  { key: "table", label: "Table" },
  { key: "paid_cents", label: "Paid", numeric: true },
  { key: "ticket_count", label: "Tickets", numeric: true },
];

export default function GuestList({
  guests,
  onNew,
  onEdit,
  onDelete,
  busy = false,
}) {
  const [selectedId, setSelectedId] = useState(null);
  const [query, setQuery] = useState(""),
    [relationship, setRelationship] = useState(null),
    [table, setTable] = useState(null);
  const [sort, setSort] = useState({ key: "name", direction: "asc" });
  const records = guests.map((g) => ({
    ...g,
    relationship: String(g.guest_of ?? "").trim(),
    table: tableNumber(g.table_no),
  }));
  const choices = (key) =>
    [...new Set(records.map((g) => g[key]))].sort((a, b) =>
      !a ? 1 : !b ? -1 : compareText(a, b),
    );
  const search = query.trim().toLowerCase();
  const rows = records
    .filter(
      (g) =>
        (relationship === null || g.relationship === relationship) &&
        (table === null || g.table === table) &&
        (!search ||
          `${g.name} ${g.relationship} ${g.table} ${g.remarks || ""}`
            .toLowerCase()
            .includes(search)),
    )
    .sort((a, b) => {
      const column = columns.find((c) => c.key === sort.key);
      const left = a[sort.key],
        right = b[sort.key];
      // Keep unassigned values at the bottom in both directions.
      if (left === "" || left === null || left === undefined)
        return right === "" || right === null || right === undefined
          ? compareText(a.name, b.name)
          : 1;
      if (right === "" || right === null || right === undefined) return -1;
      const compared = column.numeric
        ? Number(left) - Number(right)
        : compareText(String(left), String(right));
      return (
        compared * (sort.direction === "asc" ? 1 : -1) ||
        compareText(a.name, b.name) ||
        compareText(a.id, b.id)
      );
    });
  const filtered = query || relationship !== null || table !== null;
  const selected = rows.find((guest) => guest.id === selectedId);
  const filterValue = (value) => (value === null ? "all" : `value:${value}`);
  const selectedValue = (event) =>
    event.target.value === "all" ? null : event.target.value.slice(6);

  return (
    <section className="panel guest-panel">
      <div className="panel-heading">
        <div>
          <h2>
            Your guests <span className="heading-count">{guests.length}</span>
          </h2>
          <p>Names stay private to this raffle desk.</p>
        </div>
        <input
          className="search-input"
          placeholder="Search name, table, relationship…"
          aria-label="Search guests"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <div className="guest-actions">
        <button className="button primary" onClick={onNew} disabled={busy}>
          <Plus size={15} />
          New guest
        </button>
        <button
          className="button"
          disabled={busy || !selected}
          onClick={() => onEdit(selected)}
        >
          <Pencil size={15} />
          Edit selected guest
        </button>
        <button
          className="button guest-delete"
          disabled={busy || !selected}
          onClick={() => onDelete(selected)}
        >
          <Trash2 size={15} />
          Delete selected guest
        </button>
        <span>
          {selected
            ? `${selected.name} selected`
            : "Select a guest to edit or delete."}
        </span>
      </div>
      <div className="guest-filters">
        <label>
          Guest Of / Relationship
          <select
            aria-label="Filter guests by relationship"
            value={filterValue(relationship)}
            onChange={(e) => setRelationship(selectedValue(e))}
          >
            <option value="all">All relationships</option>
            {choices("relationship").map((value) => (
              <option key={value} value={`value:${value}`}>
                {value || "Unassigned"}
              </option>
            ))}
          </select>
        </label>
        <label>
          Table
          <select
            aria-label="Filter guests by table"
            value={filterValue(table)}
            onChange={(e) => setTable(selectedValue(e))}
          >
            <option value="all">All tables</option>
            {choices("table").map((value) => (
              <option key={value} value={`value:${value}`}>
                {value || "Unassigned"}
              </option>
            ))}
          </select>
        </label>
        {filtered && (
          <button
            className="text-button"
            onClick={() => {
              setQuery("");
              setRelationship(null);
              setTable(null);
            }}
          >
            Clear filters
          </button>
        )}
        <span>
          {rows.length} of {guests.length} guests
        </span>
      </div>
      <div className="table-wrap">
        <table aria-label="Guest List">
          <thead>
            <tr>
              {columns.map((column) => {
                const active = sort.key === column.key;
                const Icon = active
                  ? sort.direction === "asc"
                    ? ArrowUp
                    : ArrowDown
                  : ArrowUpDown;
                return (
                  <th
                    key={column.key}
                    scope="col"
                    aria-sort={
                      active
                        ? sort.direction === "asc"
                          ? "ascending"
                          : "descending"
                        : "none"
                    }
                  >
                    <button
                      className="guest-sort"
                      aria-label={`Sort by ${column.label}`}
                      onClick={() =>
                        setSort({
                          key: column.key,
                          direction:
                            active && sort.direction === "asc" ? "desc" : "asc",
                        })
                      }
                    >
                      {column.label}
                      <Icon size={13} aria-hidden="true" />
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((g) => (
              <tr
                key={g.id}
                className={selected?.id === g.id ? "guest-selected" : ""}
              >
                <td>
                  <label className="guest-selection">
                    <input
                      type="radio"
                      name="selected-guest"
                      aria-label={`Select ${g.name}, table ${g.table || "unassigned"}, ${g.relationship || "no relationship"}`}
                      checked={selected?.id === g.id}
                      onChange={() => setSelectedId(g.id)}
                    />
                    <span>
                      <strong>{g.name}</strong>
                      <small>{g.remarks}</small>
                    </span>
                  </label>
                </td>
                <td>{g.relationship || "—"}</td>
                <td>{g.table || "—"}</td>
                <td>{money(g.paid_cents)}</td>
                <td>
                  <span className={`badge ${g.ticket_count ? "green" : ""}`}>
                    {g.ticket_count}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!rows.length && (
        <div className="empty">
          <div className="empty-icon">
            <Users size={25} />
          </div>
          <h3>No matching guests.</h3>
          <p>Try another search, relationship or table.</p>
          <button
            className="text-button"
            onClick={() => {
              setQuery("");
              setRelationship(null);
              setTable(null);
            }}
          >
            Clear filters
          </button>
        </div>
      )}
      <div className="panel-footer">
        <ShieldCheck size={14} />
        Click a column heading to switch between ascending and descending order.
      </div>
    </section>
  );
}
