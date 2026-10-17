import React, { useEffect, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Download,
  History,
  LoaderCircle,
  RefreshCw,
  Search,
  ShieldCheck,
} from "lucide-react";
import { money } from "./format";

const timestamps = Object.fromEntries(
  ["datetime_sg", "datetime_utc"].map((kind) => [
    kind,
    new Intl.DateTimeFormat("en-SG", {
      timeZone: kind === "datetime_sg" ? "Asia/Singapore" : "UTC",
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }),
  ]),
);

function cellText(value, type) {
  if (value === null || value === undefined || value === "") return "—";
  if (type === "money") return money(value);
  if (timestamps[type] && !Number.isNaN(Date.parse(value)))
    return timestamps[type].format(new Date(value));
  return String(value);
}

function ReportCell({ value, type }) {
  if (type === "status" && value)
    return (
      <span
        className={`badge ${["active", "confirmed"].includes(value) ? "green" : value === "pending" ? "gold" : ""}`}
      >
        {value}
      </span>
    );
  if (type === "json" && value) {
    let details = value;
    try {
      details = JSON.stringify(JSON.parse(value), null, 2);
    } catch {
      /* Show malformed historic details as plain text. */
    }
    return (
      <details className="audit-details">
        <summary>View details</summary>
        <pre>{details}</pre>
      </details>
    );
  }
  return cellText(value, type);
}

export default function AuditPage({
  loadReports,
  onDownload,
  busy,
  excelPending,
}) {
  const [report, setReport] = useState(null),
    [error, setError] = useState(""),
    [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState("payments"),
    [query, setQuery] = useState(""),
    [filter, setFilter] = useState("all"),
    [page, setPage] = useState(1);
  const refreshRef = useRef(null);
  const id = React.useId();
  useEffect(() => {
    let active = true,
      inFlight = false;
    const refresh = async () => {
      if (inFlight) return;
      inFlight = true;
      if (active) setRefreshing(true);
      try {
        const next = await loadReports();
        if (active) {
          setReport(next);
          setError("");
        }
      } catch (e) {
        if (active)
          setError(e.message || "Audit records could not be refreshed.");
      } finally {
        inFlight = false;
        if (active) setRefreshing(false);
      }
    };
    refreshRef.current = refresh;
    refresh();
    const timer = setInterval(refresh, 5000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [loadReports]);

  const sheets = report?.sheets || [];
  const sheet = sheets.find((s) => s.id === tab);
  const filterIndex =
    sheet?.columns.findIndex((c) => ["status", "action"].includes(c.type)) ??
    -1;
  const filterIsAction = sheet?.columns[filterIndex]?.type === "action";
  const options =
    filterIndex < 0
      ? []
      : [...new Set(sheet.rows.map((row) => row[filterIndex]))]
          .filter(Boolean)
          .sort();
  const search = query.trim().toLowerCase();
  const rows = (sheet?.rows || []).filter(
    (row) =>
      (filter === "all" || row[filterIndex] === filter) &&
      (!search ||
        row.some((value, index) =>
          `${value ?? ""} ${cellText(value, sheet.columns[index].type)}`
            .toLowerCase()
            .includes(search),
        )),
  );
  const pages = Math.max(1, Math.ceil(rows.length / 50));
  const currentPage = Math.min(page, pages);
  const visible = rows.slice((currentPage - 1) * 50, currentPage * 50);
  const captions = {
    payments:
      "Every payment and guest allocation, including pending, ignored and reversed records.",
    tickets:
      "Every physical ticket, with its owner and whether it is active, void or unissued.",
    events:
      "The history of imports, confirmations, corrections, reversals and settings changes.",
  };

  return (
    <section className="panel audit-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">YOUR RECORDS, TOGETHER</p>
          <h2>Audit</h2>
          <p>The same three reports as your live Excel workbook.</p>
        </div>
        <div className="audit-header-actions">
          <span className="badge">
            <ShieldCheck size={12} />
            Read only
          </span>
          <button
            className="icon-button"
            aria-label="Refresh audit records"
            disabled={refreshing}
            onClick={() => refreshRef.current?.()}
          >
            <RefreshCw size={17} className={refreshing ? "spin" : ""} />
          </button>
          <button className="button" onClick={onDownload} disabled={busy}>
            <Download size={15} />
            Export Excel
          </button>
        </div>
      </div>
      {error && (
        <div className="notice warning audit-notice" role="alert">
          <CircleAlert size={18} />
          <span>
            {error}{" "}
            {report
              ? "Showing the last loaded records."
              : "If you just updated the app, restart its server and refresh this page."}
          </span>
        </div>
      )}
      {!report ? (
        <div className="empty">
          {!error && (
            <>
              <LoaderCircle className="spin" size={24} />
              <p>Loading your audit records…</p>
            </>
          )}
          {error && (
            <button className="button" onClick={() => refreshRef.current?.()}>
              Try again
            </button>
          )}
        </div>
      ) : (
        <>
          <div
            className="audit-tabs tabs"
            role="tablist"
            aria-label="Audit sheets"
          >
            {sheets.map((s) => (
              <button
                key={s.id}
                role="tab"
                id={`${id}-${s.id}-tab`}
                aria-controls={`${id}-${s.id}-panel`}
                aria-selected={tab === s.id}
                className={tab === s.id ? "active" : ""}
                onClick={() => {
                  setTab(s.id);
                  setQuery("");
                  setFilter("all");
                  setPage(1);
                }}
              >
                {s.name}
                <span>{s.rows.length.toLocaleString("en-SG")}</span>
              </button>
            ))}
          </div>
          {sheet && (
            <div
              role="tabpanel"
              id={`${id}-${tab}-panel`}
              aria-labelledby={`${id}-${tab}-tab`}
            >
              <div className="audit-toolbar">
                <div>
                  <h3>{sheet.name}</h3>
                  <p>{captions[tab]}</p>
                </div>
                <div className="audit-filters">
                  <div className="audit-search">
                    <Search size={15} />
                    <input
                      aria-label="Search audit records"
                      placeholder="Search names, payments, ticket numbers…"
                      value={query}
                      onChange={(e) => {
                        setQuery(e.target.value);
                        setPage(1);
                      }}
                    />
                  </div>
                  {options.length > 0 && (
                    <select
                      aria-label={
                        filterIsAction ? "Filter action" : "Filter status"
                      }
                      value={filter}
                      onChange={(e) => {
                        setFilter(e.target.value);
                        setPage(1);
                      }}
                    >
                      <option value="all">
                        {filterIsAction ? "All actions" : "All statuses"}
                      </option>
                      {options.map((value) => (
                        <option key={value} value={value}>
                          {value.replaceAll("_", " ")}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>
              <div className="table-wrap audit-table-wrap">
                <table
                  className={`audit-table audit-table-${tab}`}
                  aria-label={sheet.name}
                >
                  <thead>
                    <tr>
                      {sheet.columns.map((column, index) => (
                        <th key={index} scope="col">
                          {column.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((row, index) => (
                      <tr key={`${row[0]}-${index}`}>
                        {sheet.columns.map((column, i) => (
                          <td key={i} className={`audit-cell-${column.type}`}>
                            <ReportCell value={row[i]} type={column.type} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {rows.length === 0 && (
                <div className="empty">
                  <div className="empty-icon">
                    <History size={25} />
                  </div>
                  <h3>
                    {sheet.rows.length
                      ? "No matching records."
                      : "No records yet."}
                  </h3>
                  <p>
                    {sheet.rows.length
                      ? "Try another search or filter."
                      : "Records will appear as you use the raffle desk."}
                  </p>
                </div>
              )}
              <div className="audit-pagination">
                <span>
                  {rows.length
                    ? `${(currentPage - 1) * 50 + 1}–${Math.min(currentPage * 50, rows.length)} of ${rows.length.toLocaleString("en-SG")} rows`
                    : "0 rows"}
                  {rows.length !== sheet.rows.length &&
                    ` · ${sheet.rows.length.toLocaleString("en-SG")} total`}
                </span>
                <div>
                  <button
                    className="icon-button"
                    aria-label="Previous audit page"
                    disabled={currentPage <= 1}
                    onClick={() => setPage(currentPage - 1)}
                  >
                    <ChevronLeft size={17} />
                  </button>
                  <span>
                    Page {currentPage} of {pages}
                  </span>
                  <button
                    className="icon-button"
                    aria-label="Next audit page"
                    disabled={currentPage >= pages}
                    onClick={() => setPage(currentPage + 1)}
                  >
                    <ChevronRight size={17} />
                  </button>
                </div>
              </div>
            </div>
          )}
          <div className="panel-footer">
            <ShieldCheck size={14} />
            {excelPending
              ? "Showing current records. Excel is waiting to update."
              : "Read-only records · refresh automatically every 5 seconds"}
          </div>
        </>
      )}
    </section>
  );
}
