"""Auth boundaries plus optional real PostgreSQL migration/concurrency coverage."""
import asyncio
import json
import os
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.parse import urlparse

import httpx
import psycopg
import pytest
from fastapi.testclient import TestClient
from openpyxl import load_workbook

from backend.app import BASE, create_app
from backend.cloud_auth import CloudAuth
from backend.domain import FIRST_TICKET, RuleError
from backend.excel import ExcelExporter
from backend.postgres import PostgresStore
from backend.store import Store
from scripts.migrate_cloud import migrate


@pytest.fixture
def auth(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://test-project.supabase.co")
    monkeypatch.setenv("SUPABASE_PUBLISHABLE_KEY", "test-public-key")
    monkeypatch.setenv("RAFFLE_ADMIN_EMAILS", "admin@example.com")
    return CloudAuth()


@pytest.mark.parametrize("user,expected", [
    ({"id":"one","email":"admin@example.com","email_confirmed_at":"2026-01-01"}, True),
    ({"id":"one","email":"ADMIN@example.com","email_confirmed_at":"2026-01-01"}, True),
    ({"id":"one","email":"other@example.com","email_confirmed_at":"2026-01-01"}, False),
    ({"id":"one","email":"admin@example.com"}, False),
    ({"id":"one","email":"admin@example.com","email_confirmed_at":"2026-01-01","is_anonymous":True}, False),
])
def test_auth_verifies_identity_with_supabase_and_allowlist(auth, monkeypatch, user, expected):
    original = httpx.AsyncClient
    requests = []
    def handler(request):
        requests.append(request)
        return httpx.Response(200, json=user)
    monkeypatch.setattr(httpx, "AsyncClient", lambda **kwargs: original(transport=httpx.MockTransport(handler), **kwargs))
    assert asyncio.run(auth.authorized("Bearer test-access-token")) is expected
    assert str(requests[0].url) == auth.url + "/auth/v1/user"
    assert requests[0].headers["Authorization"] == "Bearer test-access-token"
    assert not asyncio.run(auth.authorized(""))


def test_auth_fails_closed_for_forged_expired_or_unavailable_sessions(auth, monkeypatch):
    original = httpx.AsyncClient
    monkeypatch.setattr(httpx, "AsyncClient", lambda **kwargs: original(
        transport=httpx.MockTransport(lambda request: httpx.Response(401)), **kwargs))
    assert not asyncio.run(auth.authorized("Bearer forged"))
    def offline(request):
        raise httpx.ConnectError("offline")
    monkeypatch.setattr(httpx, "AsyncClient", lambda **kwargs: original(transport=httpx.MockTransport(offline), **kwargs))
    assert not asyncio.run(auth.authorized("Bearer token"))


def test_cloud_api_never_exposes_local_session_token_or_private_records(auth, tmp_path, monkeypatch):
    store = Store(tmp_path / "local", BASE / "Registration and Raffle List.xlsx")
    async def authorized(header):
        return header == "Bearer verified-admin"
    monkeypatch.setattr(auth, "authorized", authorized)
    app = create_app(cloud=True, store=store, auth=auth)
    with TestClient(app) as client:
        config = client.get("/api/session").json()
        assert config == auth.config() and "token" not in config
        for path in ("/api/state", "/api/audit", "/api/audit/sheets", "/api/excel/download"):
            assert client.get(path).status_code == 401
            assert client.get(path, headers={"X-Raffle-Token":"anything"}).status_code == 401
        assert client.post("/api/payments",json={}).status_code == 401
        public = client.get("/api/display").json()
        assert set(public) == {"pot_cents","prizes_cents","sold","voided","remaining","capacity","revision","updated_at","event_title"}
        assert client.get("/api/events").status_code == 404
        headers = {"Authorization":"Bearer verified-admin"}
        state = client.get("/api/state",headers=headers).json()
        assert len(state["guests"]) == 251
        assert state["settings"]["cloud"] and not state["settings"]["excel_pending"]
        assert not state["settings"]["mail_enabled"]
        assert client.post("/api/outlook/connect",headers=headers).status_code == 400
        assert client.post("/api/payments",headers={**headers,"Origin":"https://attacker.example"},json={}).status_code == 403


@pytest.fixture
def pg(tmp_path):
    url = os.getenv("RAFFLE_TEST_DATABASE_URL")
    if not url:
        pytest.skip("Set RAFFLE_TEST_DATABASE_URL for a disposable local PostgreSQL database")
    parsed = urlparse(url)
    if parsed.hostname not in {"127.0.0.1","localhost"} or not parsed.path.endswith("_test"):
        pytest.fail("PostgreSQL test fixture only permits a disposable localhost database ending _test")
    with psycopg.connect(url, sslmode="require") as db:
        db.execute("DROP SCHEMA IF EXISTS raffle CASCADE")
    local = Store(tmp_path / "source", BASE / "Registration and Raffle List.xlsx")
    migrate(url, local.root)
    return PostgresStore(url), local


def allocation(store, amount=5000, count=15, first=FIRST_TICKET, guest=0):
    return {"guest_id":store.guests()[guest]["id"],"amount_cents":amount,"count":count,"first_ticket":first}


def payment(store, amount=5000, key="unique"):
    return store.create_payment(amount_cents=amount, source_key=key)[0]


def test_postgres_migration_is_idempotent_and_restart_persistent(pg):
    store, local = pg
    assert store.guests() == local.guests()
    assert migrate(store.database_url, local.root) == {"already_imported":True}
    p = payment(store)
    store.confirm(p["id"], [allocation(store)], True)
    restarted = PostgresStore(store.database_url)
    assert restarted.summary()["pot_cents"] == 5000
    assert restarted.summary()["sold"] == 15
    assert restarted.payments()[0]["id"] == p["id"]
    changed = payment(local, 500, "local-after-switch")
    with pytest.raises(RuntimeError, match="already has an import"):
        migrate(store.database_url, local.root)
    assert restarted.summary()["sold"] == 15


def test_postgres_group_reconciliation_and_voids(pg):
    store, _ = pg
    p = payment(store)
    first = allocation(store,2500,8)
    second = allocation(store,2500,6,FIRST_TICKET+8,1)
    with pytest.raises(RuleError,match="exactly 15"):
        store.confirm(p["id"],[first,second],True)
    assert store.summary()["pot_cents"] == 0
    second["count"] = 7
    store.confirm(p["id"],[first,second],True)
    store.reverse(p["id"],"Verified refund; remove stubs")
    assert store.summary()["voided"] == 15 and store.summary()["pot_cents"] == 0
    another = payment(store,500,"another")
    with pytest.raises(RuleError,match="overlaps"):
        store.confirm(another["id"],[allocation(store,500,1)],True)


def test_postgres_cross_instance_confirmation_is_atomic(pg):
    store, _ = pg
    p = payment(store)
    rows = [allocation(store)]
    def confirm(_):
        return PostgresStore(store.database_url).confirm(p["id"], rows, True)
    with ThreadPoolExecutor(max_workers=4) as pool:
        results = list(pool.map(confirm,range(4)))
    assert len({r["allocations"][0]["id"] for r in results}) == 1
    assert store.summary()["sold"] == 15
    assert sum(event["action"]=="payment_confirmed" for event in store.audit()) == 1


def test_postgres_distinct_concurrent_payments_cannot_share_tickets(pg):
    store, _ = pg
    payments = [payment(store,500,"one"),payment(store,500,"two")]
    rows = [allocation(store,500,1)]
    def confirm(p):
        try:
            PostgresStore(store.database_url).confirm(p["id"], rows, True)
            return True
        except RuleError:
            return False
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(confirm,payments))
    assert sorted(results) == [False,True]
    assert store.summary()["sold"] == 1 and store.summary()["pot_cents"] == 500


def test_postgres_export_and_private_browser_roles(pg,tmp_path):
    store, _ = pg
    p = payment(store)
    store.confirm(p["id"],[allocation(store)],True)
    exporter = ExcelExporter(store,tmp_path/"live.xlsx")
    assert exporter.sync()
    book = load_workbook(exporter.output,read_only=True,data_only=True)
    assert book["Payment Ledger"]["D2"].value == 50
    assert book["Ticket Register"]["B2"].value == "active"
    book.close()
    with store.connection() as db:
        for role in ("anon","authenticated"):
            assert not db.execute("SELECT has_schema_privilege(?, 'raffle', 'USAGE')",(role,)).fetchone()[0]
            assert not db.execute("SELECT has_table_privilege(?, 'raffle.guests', 'SELECT')",(role,)).fetchone()[0]
    backup = store.backup()
    assert len(backup["tables"]["tickets"]) == 15
    assert backup["format"] == "wedding-raffle-backup-v1"


def test_migration_preserves_existing_pending_sales_reversals_and_audit(pg):
    store, local = pg
    sold = payment(local,5000,"existing-sale")
    local.confirm(sold["id"],[allocation(local)],True)
    reversed_payment = payment(local,2000,"existing-refund")
    local.confirm(reversed_payment["id"],[allocation(local,2000,5,FIRST_TICKET+15)],True)
    local.reverse(reversed_payment["id"],"Refund completed; physical stubs removed")
    payment(local,500,"pending")
    payment(local,500,"another-legitimate-equal-payment")
    original_summary = local.summary()
    original_audit = local.audit()
    with store.connection() as db:
        db.execute("DROP SCHEMA raffle CASCADE")
    migrate(store.database_url,local.root)
    assert store.summary()["pot_cents"] == original_summary["pot_cents"]
    assert store.summary()["sold"] == 15 and store.summary()["voided"] == 5
    assert store.payments() == local.payments()
    assert store.guests() == local.guests()
    assert store.audit()[1:] == original_audit
    p = payment(store,500,"after-migration")
    with pytest.raises(RuleError,match="overlaps"):
        store.confirm(p["id"],[allocation(store,500,1,FIRST_TICKET+15)],True)
