"""Durable Supabase storage using the same validated purchase rules as SQLite."""
import json
import threading
from contextlib import contextmanager
from io import BytesIO

import psycopg

from .store import Store

TABLES = ("settings", "guests", "payments", "allocations", "tickets", "audit", "mail_issues")
LOCK_ID = 52000001


class Record(dict):
    """Named and positional access, matching sqlite3.Row for shared rule code."""
    def __getitem__(self, key):
        return tuple(self.values())[key] if isinstance(key, int) else super().__getitem__(key)


def record_factory(cursor):
    names = [column.name for column in cursor.description] if cursor.description else []
    return lambda values: Record(zip(names, values))


class Connection:
    def __init__(self, raw):
        self.raw = raw

    def execute(self, sql, params=None):
        # Only application-authored SQL reaches this adapter; values stay bound parameters.
        return self.raw.execute(sql.replace("?", "%s"), params)

    def executemany(self, sql, params):
        with self.raw.cursor() as cursor:
            cursor.executemany(sql.replace("?", "%s"), params)


class PostgresStore(Store):
    def __init__(self, database_url):
        self.database_url = database_url
        self.lock = threading.RLock()
        self._transaction = threading.local()

    @contextmanager
    def connection(self):
        with self.lock:
            existing = getattr(self._transaction, "connection", None)
            if existing is not None:
                yield existing
                return
            with psycopg.connect(self.database_url, connect_timeout=10, sslmode="require",
                                 prepare_threshold=None, row_factory=record_factory) as raw:
                raw.execute("SET LOCAL statement_timeout = '20s'")
                raw.execute("SET LOCAL search_path = raffle, pg_catalog")
                # Shared across every Vercel instance. Serializes confirmation checks + writes.
                raw.execute("SELECT pg_advisory_xact_lock(%s)", (LOCK_ID,))
                self._transaction.connection = Connection(raw)
                try:
                    yield self._transaction.connection
                finally:
                    self._transaction.connection = None

    @contextmanager
    def snapshot(self):
        with self.connection():
            yield

    @property
    def template(self):
        # The private original lives in PostgreSQL, never in the public deployment bundle.
        with self.connection() as db:
            row = db.execute("SELECT contents FROM workbook_template WHERE id=1").fetchone()
            if not row:
                raise RuntimeError("Import the local raffle database and workbook before using cloud exports.")
            return BytesIO(bytes(row[0]))

    def backup(self):
        with self.connection() as db:
            return {"format": "wedding-raffle-backup-v1", "tables": {
                table: [dict(row) for row in db.execute(f'SELECT * FROM "{table}"')]
                for table in TABLES}}


class OnDemandExporter:
    """Cloud transactions persist in PostgreSQL; workbook downloads are generated on request."""
    def sync(self):
        return True
