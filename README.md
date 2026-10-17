# The Wedding Raffle

A raffle desk with a live prize-pool display and a second potential-prize display. It can run locally on this Mac or on the existing Vercel + Supabase deployment; see `CLOUD-SETUP.md` for the cloud URLs.

## Open the app

Dependencies are installed and the interface is already built in this workspace.

**Double-click `Start Raffle.command`.** Keep its Terminal window running during the event. It opens:

- Admin: <http://127.0.0.1:8765/admin>
- Projector: <http://127.0.0.1:8765/display>
- Potential prizes: <http://127.0.0.1:8765/display/potential>

Move the display window onto your projector/TV and use its fullscreen button. Use extended desktop so guests see only the display window. Keep the Mac awake and connected to power. Press **Control-C** in Terminal when finished. Restarting preserves purchases and catches up on Outlook alerts.

For a fresh installation on this Mac, install Python 3.14 and Node.js 24, run `./setup.sh`, then use the launcher. The pinned Python and npm lock files reproduce the tested dependency versions. Internet is required for installation, Microsoft sign-in and new email alerts; ordinary administration and the display run locally.

## Projector displays

**Live display** shows confirmed totals. New confirmed purchases trigger a nine-second celebration with gold fireworks, confetti, sweeping light, a large contribution announcement and an animated pot total. The caption thanks the selected guest names: **Added by Alex and Jamie. Huat ah!!!** Group purchases acknowledge all selected guests. Open the display, click **Enable sound** once, and check **Preview effect** before guests arrive. Each celebration plays `frontend/src/assets/markus_lion_dance.mp3` once; another arrival restarts the clip without overlapping it. Browser autoplay rules require that first click; repeat it after reloading the page. The preview uses example names and does not create a payment or change the pot. The sound can be muted at any time. Initial page loads, repeated polls and reversals do not trigger a celebration. Reduced-motion preferences replace fireworks with a static announcement.

**Potential prizes** uses a dark green and gold layout to show how all five prizes would look at larger example pots, initially $3,000 / $4,000 / $5,000. It rotates every nine seconds and can be paused or switched manually. Examples are labelled as illustrative, with the actual live pot and available tickets shown separately. Targets update as the pot grows and stay within the maximum possible pot based on remaining tickets at $5 each. When inventory runs out, the screen shows the confirmed prize amounts and removes the purchase invitation.

Both screens have fullscreen controls and links to each other. The potential-prize screen requests only aggregate totals. The main display also requests guest names for newly confirmed contributions from the public celebration feed; it never receives the guest roster, relationships, table numbers, payment references or bank details.

## Record the first payment

1. Click **Record payment** and enter the verified transfer amount. Its ticket entitlement is calculated immediately.
2. Search for the guest in the same form. Table, guest-of and remarks distinguish duplicate names. There is no separate pending-payment step for manual purchases.
3. The app prefills the next available consecutive ticket range from saved purchases, including after a restart. Selling five tickets starting at **52000001** makes the next suggestion **52000006**. The prefix **5200** is fixed; you can edit the last four digits if the physical tickets differ. Group allocations also receive consecutive suggestions as you adjust their counts. Issued and voided numbers are skipped, and the field stays blank when no suitable range remains. Check the complete range before confirming. Valid stock is **52000001–52001500**, inclusive.
4. For a group purchase, click **Split with another guest** and enter each person's amount, ticket count and first number. Guest amounts must total the transfer and counts must total its entitlement.
5. Check the verification box and **Confirm purchase**. Then hand out the exact recorded ranges. The display, guest totals and Excel copy update.

Packages apply separately to each whole transfer: $5 → 1, $20 → 5, $50 → 15, $100 → 30, $240 → 70. A $50 group transfer earns 15 tickets to distribute. Four separate $5 transfers earn four tickets. Unsupported amounts cannot be confirmed; resolve the actual transfer outside the app before recording a valid purchase. Imported Outlook alerts still use the pending queue. Do not silently change received amounts.

## Manage guests

In **Guest list**, use **New guest**, or select a guest using the radio button and choose **Edit selected guest**. Names, guest-of/relationship and whole-number table assignments are editable. A blank table means unassigned. Edits retain the guest's ID, purchases and ticket ownership.

**Delete selected guest** removes the guest from the list and future purchases after a confirmation. Existing payments, tickets and the pot are preserved. The live Excel copy retains the guest's row with a **Removed** status so financial totals still reconcile. Guest changes appear in **Raffle Audit**. The original workbook is unchanged.

If similar alerts have the same bank time, amount and account suffix, check the actual bank transactions and acknowledge whether they represent separate transfers. Emails alone cannot identify the buyer or prove that two messages represent different bank transactions.

## Connect personal Outlook / Hotmail

Automatic intake is implemented but **not connected to your mailbox**. Complete these steps in **Settings**:

1. [Register an application in Microsoft Entra](https://learn.microsoft.com/en-us/entra/identity-platform/quickstart-register-app). Choose support for **personal Microsoft accounts**. Entra tenant access is required; a personal Outlook login alone may not provide app-registration access. Microsoft may require additional account/subscription setup.
2. Under **Authentication**, add a **Mobile and desktop applications** platform with redirect URI **`http://localhost`**. This is a public client; do **not** create a client secret.
3. Under **API permissions**, add Microsoft Graph **delegated `Mail.Read`**. No mail-writing, sending or application-wide permissions are used. Microsoft grants read permission across the signed-in mailbox; filtering by bank sender happens in this app.
4. Copy the **Application (client) ID** into Settings. Copy the exact sender address from an actual UOB email, enter your bank account's last four digits, and choose the time from which alerts should be imported. The app starts at zero and does not import older alerts unless you move that time backwards.
5. Save, click **Connect Outlook**, and sign in to the correct personal mailbox. Allow macOS Keychain access when prompted. Tokens are protected by Keychain; the app does not fall back to plaintext token files.
6. Keep matching alerts in the **Inbox**. The expected subject is **`UOB-PayNow transfer received`** and the body should match your sample. Test real $5/$20/$50 notifications before relying on intake.

The app polls every 15 seconds, remembers incremental sync progress and catches up after restarts/outages. Delays and rate limits are shown in Settings. Expired sessions need reconnection. Malformed matching alerts are listed for manual review. If you change sender, account suffix or intake time, save and reconnect; existing imports are protected against reimport. The projector does not show mailbox connection details.

Email notifications can be delayed or missing. Use **Record payment** after checking UOB when needed. Sender matching is a filter, not proof of bank authenticity; each purchase still needs your verification.

## Excel, corrections and backups

Open **Audit** in the admin sidebar to view **Payment Ledger**, **Ticket Register** and **Raffle Audit** without opening Excel. These read-only tables share their report definitions with the Excel export, refresh every five seconds, and support search, status/action filters and 50-row pages. Ticket Register includes all 1,500 tickets, including unissued and voided numbers. Expand **View details** in Raffle Audit to inspect a change. All audit reports stay in the admin view; the projector shows only the public totals.

- The supplied **Registration and Raffle List.xlsx** remains unchanged. A private template snapshot is saved at first import; later edits to the original do not modify the app's roster.
- The live output is **`outputs/Registration and Raffle List - Live.xlsx`**. Raffle F/G show each guest's active tickets and amount paid; H links to payment IDs. Other original sheets are preserved. **Payment Ledger**, **Ticket Register** and **Raffle Audit** provide the detail.
- Keep raffle edits in the app. Excel is a generated copy and edits there will be overwritten. Attendance updates to the original workbook are separate and are not automatically merged into the generated copy.
- Close the live workbook while processing purchases. If Excel creates a lock file or a write fails, the purchase remains committed and **Excel update pending** appears. The app retries every 10 seconds; the status can also be clicked to retry. The export button refuses stale copies. Some Mac applications do not create reliable lock files, so closing the live workbook is the safest practice.
- Excel summary formulas recalculate when opened in Excel; the app's totals come directly from SQLite. Voided tickets are excluded from both active sales and available inventory.
- To correct a guest, open a confirmed payment under **Confirmed → Change guest** and provide a reason. Money and ticket numbers remain unchanged.
- To reverse an entire payment, open it, choose **Reverse payment**, provide a reason and remove every corresponding physical stub from the draw. Its numbers are permanently void. This records a reversal only; it does not move or refund bank funds.
- The app makes SQLite backups at startup and after confirmed changes, keeping the latest 20 in **`data/backups/`**. **Back up records** creates an additional snapshot. Copy the full project, including `data/` and the live workbook, to a private backup location before the event and after closing the app. Do not upload guest/bank records publicly.

To restore a backup: stop the app, preserve the current `data/` folder elsewhere, replace `data/raffle.sqlite3` with the chosen backup, remove any old `raffle.sqlite3-wal` / `raffle.sqlite3-shm` sidecars, and restart with the same `data/registration-template.xlsx`. The workbook is regenerated. Recovery should be rehearsed with a copy, not during active selling.

## Prize calculation

Below $1,600, split the confirmed pot in the ratio **5:5:3:2:1**. For example, an $800 pot pays **$250 / $250 / $150 / $100 / $50**.

At $1,600 and above, prizes are **pot minus $1,100 / $500 / $300 / $200 / $100**. Calculations use integer cents. Scaled values round down; leftover cents go to prizes in order. Prizes always sum to the pot. Drawing winners and paying prizes are handled physically, outside this app.

## Verification

```sh
.venv/bin/python -m pytest -q
cd frontend
npx vitest run
npm run build
```

Tests use temporary databases and synthetic payment/email fixtures; no real bank transfers, mailbox connections or live raffle purchases are created. Backend coverage includes group totals, package optimisation, prize rounding, capacity/boundaries, concurrent retries, duplicate email imports, delta recovery, expiry/rate limits, reversals, guest management, atomic manual purchases, workbook preservation, file-lock recovery and API privacy. UI tests cover form reconciliation, verification, retry identifiers, guest selection and projector data isolation.

Frontend components are in `frontend/src`. Run `npm run format` there to format the code, or `npm run format:check` to check it without writing changes.

Production browser visual QA and real Microsoft sign-in/alert delivery still require verification on your event setup. Before collecting funds, confirm the applicable basis for paid entries: [GRA's incidental-event draw guidance](https://www.gra.gov.sg/licenses-approvals/class-licences/faq-for-incidental-games-of-chance-and-lotteries) requires draw participation to be free; wedding-only attendance does not itself establish eligibility for paid entries.
# raffe
# Cloud hosting

For Vercel + Supabase setup, data migration and administrator sign-in, see [CLOUD-SETUP.md](CLOUD-SETUP.md). The cloud version uses manual payment intake; Outlook is deferred. Keep the registration workbook locally; it is intentionally excluded from Git and Vercel uploads.
