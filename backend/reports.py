"""Shared report definitions for the admin Audit view and live Excel workbook."""
from .domain import FIRST_TICKET, LAST_TICKET


def audit_reports(store):
    with store.snapshot():
        payments = store.payments()
        events = store.audit()
        revision = store.settings()["revision"]

    ledger = []
    assigned = {}
    for payment in reversed(payments):
        for index, allocation in enumerate(payment["allocations"] or [None]):
            a = allocation or {}
            ledger.append([
                payment["id"], payment["status"], payment["source"],
                payment["amount_cents"] if index == 0 else None,
                a.get("guest_id"), a.get("name"), a.get("amount_cents"), a.get("count"),
                a.get("first_ticket"), a["first_ticket"] + a["count"] - 1 if a else None,
                payment["bank_time"], payment["created_at"], payment["note"], payment["source_key"],
            ])
            if a:
                for number in range(a["first_ticket"], a["first_ticket"] + a["count"]):
                    assigned[number] = ["void" if payment["status"] == "reversed" else "active",
                                        payment["id"], a["guest_id"], a["name"]]

    def columns(*items):
        return [{"label": label, "type": kind} for label, kind in items]

    return {"revision": revision, "sheets": [
        {"id": "payments", "name": "Payment Ledger", "columns": columns(
            ("Payment ID", "text"), ("Status", "status"), ("Source", "text"),
            ("Payment total (SGD, first row only)", "money"), ("Guest ID", "text"),
            ("Guest", "text"), ("Guest amount (SGD)", "money"), ("Tickets", "number"),
            ("First ticket", "number"), ("Last ticket", "number"),
            ("Bank time (Singapore)", "datetime_sg"), ("Recorded at (UTC)", "datetime_utc"),
            ("Note", "text"), ("Email reference", "text")), "rows": ledger},
        {"id": "tickets", "name": "Ticket Register", "columns": columns(
            ("Ticket number", "number"), ("Status", "status"), ("Payment ID", "text"),
            ("Guest ID", "text"), ("Guest", "text")),
         "rows": [[number, *assigned.get(number, ["unissued", None, None, None])]
                  for number in range(FIRST_TICKET, LAST_TICKET + 1)]},
        {"id": "events", "name": "Raffle Audit", "columns": columns(
            ("Sequence", "number"), ("At (UTC)", "datetime_utc"), ("Action", "action"),
            ("Payment ID", "text"), ("Details", "json")),
         "rows": [[e["id"], e["at"], e["action"], e["payment_id"], e["details"]]
                  for e in reversed(events)]},
    ]}
