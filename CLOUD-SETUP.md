# Vercel + Supabase

The cloud version uses Supabase PostgreSQL and Supabase Auth. Vercel serves FastAPI and the React interface. Outlook intake is deferred; manual entry and pasted bank alerts work.

## Connect and provision

Install and connect the Vercel and Supabase plugins offered in the conversation. Account authorization must be completed by the account owner. Use free projects, preferably in Singapore; do not enable paid upgrades.

Create a Supabase project, then create the administrator in **Authentication → Users** using the email supplied in the conversation. Set a password there and mark that email confirmed only for the account owner. Disable public signups under Authentication settings. No invitations or email connection are needed.

## Import current records

Stop recording new local purchases during the one-time transfer. Keep the local app and its files as a backup. First inspect the counts:

```sh
.venv/bin/python scripts/migrate_cloud.py --check
```

Run the import, pasting the **Transaction pooler** database URL at the hidden prompt. Copy this from Supabase's Connect dialog (port 6543), including its database password. Never paste it into a chat, frontend source or command-line argument.

```sh
.venv/bin/python scripts/migrate_cloud.py
```

The import applies `supabase/migrations/001_raffle.sql` and copies guests, every payment status, allocations, tickets, audit history and the workbook template in one transaction. It preserves IDs and refuses to overwrite a nonempty project. Repeating the same import is a no-op. The local database remains unchanged.

Raffle tables and the workbook are in a private `raffle` schema. Anonymous and authenticated browser clients cannot read them directly. Only the backend connects to this schema. Cross-instance transaction locks prevent two administrators from issuing the same ticket numbers.

## Deploy

Create a Vercel project from this directory, selecting **FastAPI**. The root `app.py`, `.python-version` and `vercel.json` configure the runtime, frontend build and Singapore region. Set these server environment variables for Production (and Preview only if desired):

| Variable | Value |
| --- | --- |
| `SUPABASE_DATABASE_URL` | Transaction-pooler URL, including database password |
| `SUPABASE_URL` | Project HTTPS URL |
| `SUPABASE_PUBLISHABLE_KEY` | Project publishable key, or legacy anon key |
| `RAFFLE_ADMIN_EMAILS` | Approved administrator email, comma-separated for multiple admins |
| `RAFFLE_ALLOWED_HOSTS` | Optional custom domain names, without scheme |

Do not use `VITE_` for server secrets. `.vercelignore` excludes local databases, workbooks, backups, output files and environment files from upload. The workbook template is imported privately into PostgreSQL; it is not a static asset.

Using the Vercel CLI after account connection:

```sh
npx vercel deploy --prod
```

Open `/admin` and sign in. Open `/display` on the projector. The display polls aggregate totals every two seconds and never fetches guest or banking data. Admin data refreshes every five seconds. Changes need an internet connection; pending forms do not represent saved purchases.

Excel downloads are generated from committed cloud records on demand. They do not modify the workbook on your laptop. **Back up records** downloads a JSON snapshot of all ledger tables; retain the original local template too. The JSON includes private guest information and should be stored privately.

## Verify before switching over

Compare the local and cloud pot, guest count, sold/void/remaining inventory and all three Audit sheets. Test an actual manual payment and group allocation, then reverse the test with a reason and remove its stubs. Reversed ticket numbers stay void. Confirm unauthenticated `/api/state` and `/api/audit/sheets` requests are rejected, while `/api/display` contains only aggregates. Sign out and back in; redeploy and verify that records remain.

Use the cloud database as the sole ledger after switching over. The local SQLite database does not automatically synchronize with Supabase. If internet fails, keep verified transfers and physical ticket records for reconciliation when service returns; do not run two independent ticket ledgers concurrently.

## Free-plan limits

Check the provider dashboards before the wedding. Supabase Free projects can pause after inactivity and do not include automatic backups. Wake the project before rehearsal and download your own records backup. Vercel Hobby is intended for personal, noncommercial use; confirm this event fits the current terms. No scheduled email worker or paid service is configured.

References: [Vercel FastAPI](https://vercel.com/docs/frameworks/backend/fastapi), [Supabase pooler connections](https://supabase.com/docs/guides/database/connecting-to-postgres), [Supabase server-verified users](https://supabase.com/docs/reference/javascript/auth-getuser), [Supabase pricing](https://supabase.com/pricing), [Vercel Hobby](https://vercel.com/docs/plans/hobby).
