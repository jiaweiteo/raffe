"""One-time, non-destructive SQLite -> Supabase import. Never prints credentials or guest data."""
import argparse
import getpass
import hashlib
import json
import os
import sqlite3
import sys
from pathlib import Path

BASE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BASE))

from backend.postgres import TABLES, PostgresStore
from backend.domain import now_iso


def read_snapshot(data_dir):
    database = Path(data_dir) / "raffle.sqlite3"
    template = Path(data_dir) / "registration-template.xlsx"
    if not database.is_file() or not template.is_file():
        raise RuntimeError("Local raffle database or saved registration template is missing.")
    # Read-only and transaction-consistent, including committed WAL contents.
    with sqlite3.connect(database.as_uri() + "?mode=ro", uri=True) as db:
        db.row_factory = sqlite3.Row
        db.execute("BEGIN")
        tables = {table: [dict(row) for row in db.execute(f'SELECT * FROM "{table}" ORDER BY 1')]
                  for table in TABLES}
    contents = template.read_bytes()
    fingerprint = hashlib.sha256(json.dumps(tables, sort_keys=True).encode() + contents).hexdigest()
    return tables, contents, fingerprint


def migrate(database_url, data_dir, *, apply_schema=True):
    tables, contents, fingerprint = read_snapshot(Path(data_dir).resolve())
    store = PostgresStore(database_url)
    with store.connection() as db:
        # The deployment user applies this migration once; import and all rows commit together.
        if apply_schema:
            db.raw.execute((BASE / "supabase/migrations/001_raffle.sql").read_text(), prepare=False)
        previous = db.execute("SELECT value FROM settings WHERE key='cloud_import_fingerprint'").fetchone()
        if previous:
            if json.loads(previous[0]) == fingerprint:
                return {"already_imported": True}
            raise RuntimeError("Cloud already has an import. Refusing to overwrite cloud purchases with a different local snapshot.")
        for table in TABLES:
            if db.execute(f'SELECT 1 FROM "{table}" LIMIT 1').fetchone():
                raise RuntimeError("Cloud raffle tables are not empty. No records were overwritten.")
        for table in TABLES:
            rows = tables[table]
            if rows:
                columns = list(rows[0])
                fields = ",".join('"' + col + '"' for col in columns)
                placeholders = ",".join("?" for _ in columns)
                db.executemany(f'INSERT INTO "{table}" ({fields}) VALUES ({placeholders})',
                               [tuple(row[col] for col in columns) for row in rows])
        db.execute("INSERT INTO workbook_template VALUES (1,?,?)", (contents, hashlib.sha256(contents).hexdigest()))
        db.execute("SELECT setval(pg_get_serial_sequence('raffle.audit','id'), COALESCE(MAX(id),0)+1, false) FROM audit")
        store._set(db, "cloud_import_fingerprint", fingerprint)
        store._set(db, "cloud_imported_at", now_iso())
        store._set(db, "mail_enabled", False)
        store._set(db, "mail_username", None)
        store._set(db, "delta_link", "")
        store._set(db, "excel_pending", False)
        store._set(db, "excel_error", "")
        store._audit(db, "cloud_imported", None, {"counts": {table: len(rows) for table, rows in tables.items()}})
        store._changed(db)
    return {"imported": {table: len(rows) for table, rows in tables.items()}, "summary": store.summary()}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data-dir", type=Path, default=BASE / "data")
    parser.add_argument("--check", action="store_true", help="Inspect only local counts; do not connect or import")
    parser.add_argument("--schema-applied", action="store_true", help="Use an existing schema provisioned through the Supabase MCP")
    args = parser.parse_args()
    if args.check:
        tables, _, _ = read_snapshot(args.data_dir.resolve())
        print(json.dumps({"local_counts": {table: len(rows) for table, rows in tables.items()}}))
        return
    url = os.getenv("SUPABASE_DATABASE_URL") or getpass.getpass("Supabase transaction-pooler connection URL (hidden): ")
    try:
        print(json.dumps(migrate(url, args.data_dir, apply_schema=not args.schema_applied)))
    except Exception:
        # Driver exceptions can contain connection details. Do not print them into logs.
        print("Import did not complete. Existing records were preserved. Check connectivity, database permissions and whether this cloud project has already been imported.", file=sys.stderr)
        raise SystemExit(1)


if __name__ == "__main__":
    main()
