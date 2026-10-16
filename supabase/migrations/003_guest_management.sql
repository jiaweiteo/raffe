-- Soft deletion preserves allocations, tickets, and the financial audit trail.
ALTER TABLE raffle.guests ADD COLUMN IF NOT EXISTS deleted_at TEXT;
GRANT INSERT(id, name, remarks, guest_of, table_no, source_row) ON raffle.guests TO raffle_backend;
GRANT UPDATE(name, guest_of, table_no, deleted_at) ON raffle.guests TO raffle_backend;
