import asyncio
import json
import os
import secrets
import tempfile
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Annotated
from urllib.parse import urlparse
from uuid import UUID

from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, ConfigDict, Field, StrictBool, StrictInt
from starlette.middleware.trustedhost import TrustedHostMiddleware

from .domain import RuleError, now_iso, parse_alert
from .excel import ExcelExporter
from .outlook import Outlook
from .reports import audit_reports
from .store import Store

BASE = Path(__file__).resolve().parent.parent


class Input(BaseModel):
    model_config = ConfigDict(extra="forbid")


class ManualPayment(Input):
    request_id: UUID
    amount_cents: Annotated[StrictInt, Field(gt=0, le=100_000_000)] | None = None
    alert_body: str = Field(default="", max_length=20000)
    note: str = Field(default="", max_length=1000)


class Allocation(Input):
    guest_id: str = Field(max_length=100)
    amount_cents: Annotated[StrictInt, Field(ge=0, le=100_000_000)]
    count: Annotated[StrictInt, Field(gt=0, le=1500)]
    first_ticket: StrictInt


class Confirmation(Input):
    allocations: list[Allocation] = Field(min_length=1, max_length=1500)
    verified: StrictBool
    duplicate_ack: StrictBool = False


class Purchase(Input):
    request_id: UUID
    amount_cents: Annotated[StrictInt, Field(gt=0, le=100_000_000)]
    note: str = Field(default="", max_length=1000)
    allocations: list[Allocation] = Field(min_length=1, max_length=1500)
    verified: StrictBool


class GuestInput(Input):
    name: str = Field(min_length=1, max_length=200)
    guest_of: str = Field(default="", max_length=200)
    table_no: Annotated[StrictInt, Field(ge=1, le=9999)] | None = None


class NewGuest(GuestInput):
    request_id: UUID


class Reason(Input):
    reason: str = Field(min_length=3, max_length=1000)


class Reassignment(Reason):
    guest_id: str = Field(max_length=100)


class Settings(Input):
    event_title: str = Field(min_length=1, max_length=100)
    client_id: str = Field(default="", max_length=100)
    trusted_sender: str = Field(default="", max_length=254)
    account_suffix: str = Field(default="", max_length=4)
    start_time: datetime


def create_app(data_dir=None, source=None, output=None, run_workers=True, *, cloud=False, store=None, auth=None):
    if cloud:
        from .postgres import PostgresStore, OnDemandExporter
        from .cloud_auth import CloudAuth
        store = store or PostgresStore(os.environ["SUPABASE_DATABASE_URL"])
        auth = auth or CloudAuth()
        exporter, outlook, run_workers = OnDemandExporter(), None, False
    else:
        store = store or Store(Path(data_dir or os.getenv("RAFFLE_DATA_DIR", BASE / "data")),
                              Path(source or BASE / "Registration and Raffle List.xlsx"))
        exporter = ExcelExporter(store, output or BASE / "outputs" / "Registration and Raffle List - Live.xlsx")
        outlook = Outlook(store)
    session_token = secrets.token_urlsafe(32)

    async def email_worker():
        while True:
            await asyncio.to_thread(outlook.poll)
            await asyncio.sleep(15)

    async def excel_worker():
        while True:
            if store.settings()["excel_pending"]:
                await asyncio.to_thread(exporter.sync)
            await asyncio.sleep(10)

    @asynccontextmanager
    async def lifespan(app):
        if run_workers:
            await asyncio.to_thread(store.backup)
            await asyncio.to_thread(exporter.sync)
        jobs = [asyncio.create_task(email_worker()), asyncio.create_task(excel_worker())] if run_workers else []
        yield
        for job in jobs:
            job.cancel()
        await asyncio.gather(*jobs, return_exceptions=True)

    app = FastAPI(title="Wedding Raffle", lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)
    app.state.store, app.state.exporter, app.state.outlook = store, exporter, outlook
    hosts = ["localhost", "127.0.0.1", *([] if run_workers else ["testserver"])]
    if cloud:
        hosts += ["*.vercel.app", *filter(None, os.getenv("RAFFLE_ALLOWED_HOSTS", "").split(","))]
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=hosts)

    @app.middleware("http")
    async def local_security(request, call_next):
        path = request.url.path
        if path.startswith("/api/"):
            if request.headers.get("sec-fetch-site") == "cross-site":
                return JSONResponse({"detail": "Open the app directly in its own browser tab."}, status_code=403)
            origin = request.headers.get("origin")
            if origin and urlparse(origin).netloc != request.headers.get("host"):
                return JSONResponse({"detail": "Cross-origin access is disabled."}, status_code=403)
            public = path in {"/api/display", "/api/events", "/api/health", "/api/session"}
            if not public:
                if cloud:
                    if not await auth.authorized(request.headers.get("authorization", "")):
                        return JSONResponse({"detail": "Sign in with an authorized administrator account."}, status_code=401)
                elif not secrets.compare_digest(request.headers.get("x-raffle-token", ""), session_token):
                    return JSONResponse({"detail": "Reload the admin page to renew its local session."}, status_code=403)
            if request.method in {"POST", "PUT", "PATCH", "DELETE"}:
                body = await request.body()
                if len(body) > 128000:
                    return JSONResponse({"detail": "Request is too large."}, status_code=413)
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "no-referrer"
        connect = "'self'" + (" " + auth.url if cloud else "")
        response.headers["Content-Security-Policy"] = f"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src {connect}; img-src 'self' data:; font-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"
        if path.startswith("/api/"):
            response.headers["Cache-Control"] = "no-store"
        return response

    @app.exception_handler(RuleError)
    async def rule_error(request, exc):
        return JSONResponse({"detail": str(exc)}, status_code=400)

    def safe_settings():
        config = store.settings()
        keys = ["event_title", "client_id", "trusted_sender", "account_suffix", "start_time", "sync_status",
                "last_sync", "excel_pending", "excel_error", "last_export", "mail_enabled", "mail_username"]
        result = {key: config.get(key) for key in keys}
        result["cloud"] = cloud
        if cloud:
            result.update(excel_pending=False, excel_error="", mail_enabled=False, mail_username=None,
                          sync_status="Manual intake · Outlook deferred")
        return result

    def persist_outputs():
        # The payment is already committed. Output failures must never make callers think it was rolled back.
        if cloud:
            return
        exporter.sync()
        try:
            store.backup()
            store.set_values(backup_error="", last_backup=now_iso())
        except Exception:
            store.set_values(backup_error="Local backup needs attention. Check available disk space.")

    @app.get("/api/health")
    def health():
        return {"status": "ok"}

    @app.get("/api/session")
    def session():
        return auth.config() if cloud else {"mode": "local", "token": session_token}

    @app.get("/api/display")
    def display():
        return store.summary()

    @app.get("/api/state")
    def state():
        with store.snapshot():
            config = store.settings()
            return {"summary": store.summary(), "guests": store.guests(), "payments": store.payments(),
                    "settings": safe_settings(), "mail_issues": [] if cloud else store.mail_issues(),
                    "backup_error": "" if cloud else config.get("backup_error", "")}

    @app.get("/api/events")
    async def events(request: Request):
        if cloud:
            return JSONResponse({"detail": "Use /api/display polling for serverless updates."}, status_code=404)
        async def stream():
            revision = None
            heartbeat = 0
            while not await request.is_disconnected():
                summary = await asyncio.to_thread(store.summary)
                if summary["revision"] != revision:
                    yield "data: " + json.dumps(summary) + "\n\n"
                    revision = summary["revision"]
                elif heartbeat % 5 == 0:
                    yield ": heartbeat\n\n"
                heartbeat += 1
                await asyncio.sleep(1)
        return StreamingResponse(stream(), media_type="text/event-stream", headers={"X-Accel-Buffering": "no"})

    @app.post("/api/payments")
    def manual_payment(body: ManualPayment):
        if body.alert_body.strip():
            parsed = parse_alert(body.alert_body)
            if body.amount_cents is not None and body.amount_cents != parsed["amount_cents"]:
                raise RuleError("The typed amount does not match the pasted alert.")
            config = store.settings()
            if config["account_suffix"] and parsed["account_suffix"] != config["account_suffix"]:
                raise RuleError("This alert is for a different bank account.")
            payment, created = store.create_payment(**parsed, source="pasted_email", source_key="manual:" + str(body.request_id), note=body.note)
        else:
            if body.amount_cents is None:
                raise RuleError("Enter an amount or paste an alert.")
            payment, created = store.create_payment(amount_cents=body.amount_cents, source="manual", source_key="manual:" + str(body.request_id), note=body.note)
        exporter.sync()
        return {"payment": payment, "created": created}

    @app.post("/api/purchases")
    def purchase(body: Purchase):
        result = store.create_purchase(request_id=body.request_id, amount_cents=body.amount_cents,
                                       note=body.note, verified=body.verified,
                                       allocations=[a.model_dump() for a in body.allocations])
        persist_outputs()
        return result

    @app.post("/api/guests")
    def new_guest(body: NewGuest):
        result = store.create_guest(str(body.request_id), **body.model_dump(exclude={"request_id"}))
        persist_outputs()
        return result

    @app.put("/api/guests/{guest_id}")
    def edit_guest(guest_id: str, body: GuestInput):
        result = store.update_guest(guest_id, **body.model_dump())
        persist_outputs()
        return result

    @app.delete("/api/guests/{guest_id}")
    def remove_guest(guest_id: str):
        store.delete_guest(guest_id)
        persist_outputs()
        return {"ok": True}

    @app.post("/api/payments/{payment_id}/confirm")
    def confirm(payment_id: str, body: Confirmation):
        result = store.confirm(payment_id, [a.model_dump() for a in body.allocations], body.verified, body.duplicate_ack)
        persist_outputs()
        return result

    @app.post("/api/payments/{payment_id}/ignore")
    def ignore(payment_id: str, body: Reason):
        if not body.reason.strip():
            raise RuleError("A reason is required.")
        store.ignore(payment_id, body.reason.strip())
        persist_outputs()
        return {"ok": True}

    @app.post("/api/payments/{payment_id}/reverse")
    def reverse(payment_id: str, body: Reason):
        if not body.reason.strip():
            raise RuleError("A reason is required.")
        store.reverse(payment_id, body.reason.strip())
        persist_outputs()
        return {"ok": True, "instruction": "Remove every physical draw stub for this payment. Voided numbers cannot be resold."}

    @app.patch("/api/payments/{payment_id}/allocations/{allocation_id}")
    def reassign(payment_id: str, allocation_id: str, body: Reassignment):
        if not body.reason.strip():
            raise RuleError("A reason is required.")
        store.reassign(payment_id, allocation_id, body.guest_id, body.reason.strip())
        persist_outputs()
        return {"ok": True}

    @app.put("/api/settings")
    def save_settings(body: Settings):
        import re
        if not body.event_title.strip():
            raise RuleError("Enter a display title.")
        if body.client_id:
            try:
                UUID(body.client_id)
            except ValueError as exc:
                raise RuleError("The Microsoft application ID must be a UUID.") from exc
        if body.trusted_sender and not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", body.trusted_sender):
            raise RuleError("Enter the exact sender email address shown on a genuine UOB alert.")
        if body.account_suffix and not re.fullmatch(r"\d{4}", body.account_suffix):
            raise RuleError("The account suffix must contain exactly four digits.")
        if body.start_time.tzinfo is None:
            raise RuleError("The intake start time must include a timezone.")
        values = body.model_dump()
        values["event_title"] = body.event_title.strip()
        values["trusted_sender"] = body.trusted_sender.strip().lower()
        values["start_time"] = body.start_time.astimezone(timezone.utc).isoformat()
        old = store.settings()
        changed_mail = any(old.get(key) != values[key] for key in ("client_id", "trusted_sender", "account_suffix", "start_time"))
        if changed_mail:
            if outlook:
                outlook.disconnect()
            values.update(delta_link="", sync_status="Settings saved · connect Outlook to start intake")
        with store.connection() as db:
            for key, value in values.items():
                store._set(db, key, value)
            store._audit(db, "settings_updated", None, {"mail_configuration_changed": changed_mail})
            store._changed(db)
        exporter.sync()
        return safe_settings()

    @app.post("/api/outlook/connect")
    def connect():
        if cloud:
            raise RuleError("Outlook intake is deferred. Record verified payments manually or paste an alert.")
        outlook.start_login()
        return {"ok": True}

    @app.post("/api/outlook/disconnect")
    def disconnect():
        if cloud:
            return {"ok": True}
        outlook.disconnect()
        return {"ok": True}

    @app.post("/api/mail-issues/{message_id:path}/resolve")
    def resolve_issue(message_id: str, body: Reason):
        if not body.reason.strip():
            raise RuleError("A reason is required.")
        store.resolve_mail_issue(message_id, body.reason.strip())
        persist_outputs()
        return {"ok": True}

    @app.post("/api/excel/retry")
    def retry_export():
        return {"ok": exporter.sync(), "settings": safe_settings()}

    @app.get("/api/excel/download")
    def download():
        if cloud:
            with tempfile.TemporaryDirectory(prefix="raffle-export-") as directory:
                generated = ExcelExporter(store, Path(directory) / "Registration and Raffle List - Live.xlsx")
                if not generated.sync():
                    raise RuleError("Workbook generation failed. Your purchases remain saved; please retry the download.")
                return Response(generated.output.read_bytes(),
                                media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                                headers={"Content-Disposition": 'attachment; filename="Registration and Raffle List - Live.xlsx"'})
        if store.settings()["excel_pending"]:
            raise RuleError("Excel is not up to date. Close the live workbook and retry its update before downloading.")
        if not exporter.output.is_file():
            raise RuleError("The live workbook has not been generated yet.")
        return FileResponse(exporter.output, filename=exporter.output.name)

    @app.post("/api/backups")
    def backup():
        if cloud:
            return JSONResponse(store.backup(), headers={"Content-Disposition": 'attachment; filename="raffle-backup.json"'})
        store.backup()
        return {"ok": True}

    @app.get("/api/audit")
    def audit():
        return store.audit()

    @app.get("/api/audit/sheets")
    def audit_sheets():
        return audit_reports(store)

    dist = BASE / "frontend" / "dist"
    if (dist / "assets").is_dir():
        app.mount("/assets", StaticFiles(directory=dist / "assets"), name="assets")

    @app.get("/")
    @app.get("/admin")
    @app.get("/display")
    def index():
        if not (dist / "index.html").is_file():
            return JSONResponse({"detail": "Build the interface first: cd frontend && npm run build"}, status_code=503)
        return FileResponse(dist / "index.html", headers={"Cache-Control": "no-store"})

    return app
