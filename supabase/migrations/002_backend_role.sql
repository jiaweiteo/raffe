-- The backend cannot administer Postgres or access Supabase Auth/Vault.
DO $role$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='raffle_backend') THEN
  CREATE ROLE raffle_backend NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
 END IF;
END
$role$;
GRANT USAGE ON SCHEMA raffle TO raffle_backend;
GRANT SELECT ON ALL TABLES IN SCHEMA raffle TO raffle_backend;
GRANT INSERT ON raffle.settings, raffle.payments, raffle.allocations, raffle.tickets, raffle.audit TO raffle_backend;
GRANT UPDATE ON raffle.settings, raffle.payments, raffle.allocations, raffle.tickets TO raffle_backend;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA raffle TO raffle_backend;
DO $policies$
DECLARE tab text;
BEGIN
 FOREACH tab IN ARRAY ARRAY['settings','guests','payments','allocations','tickets','audit','mail_issues','workbook_template'] LOOP
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='raffle' AND tablename=tab AND policyname='backend_access') THEN
   EXECUTE format('CREATE POLICY backend_access ON raffle.%I FOR ALL TO raffle_backend USING (true) WITH CHECK (true)',tab);
  END IF;
 END LOOP;
END
$policies$;
