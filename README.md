# Stoneline OS — Construction CRM & Business Management

An operating system for tile, flooring, cabinet and countertop contractors. It covers the whole job lifecycle (lead → site visit → estimate → contract → project → change orders → invoices → payment) in one connected data model.

**Stack:** Next.js 14 (App Router) · React 18 · TypeScript · Tailwind CSS · shadcn-style component kit · Recharts · jsPDF · Supabase (PostgreSQL, Auth, Storage, Realtime).

## Quick start

```bash
npm install
npm run dev            # http://localhost:3000
```

With no environment variables set, the app runs in **Local mode**. All data is persisted in the browser's IndexedDB and synced live across open tabs. On first launch you choose between:

- **Explore with demo company**: loads *Stoneline Interiors* with 12 months of history. You can sign in as any of the 7 roles with the password `stoneline`.
- **Start my company**: creates an empty workspace with your owner account, the default pricing catalog, templates and automations.

### Cloud mode (Supabase)

1. Create a Supabase project.
2. Apply the migrations in order: `supabase/migrations/0001_schema.sql`, `0002_security.sql`, `0003_seed.sql` (with `supabase db push` or the SQL editor).
3. Copy `.env.example` to `.env.local` and set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
4. Sign up. The first user automatically becomes **Owner**, and later users start as **Field Employee** until an admin changes their role in *Settings → Users*.

The same UI then runs against PostgreSQL. Row-level security enforces role permissions, Storage holds the files, and Realtime pushes every change to every open screen.

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` / `build` / `start` | Next.js |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Unit tests for pricing, tax, milestones, change orders, geometry, invoice status and job costing |
| `npm run db:seed-sql` | Regenerates `0003_seed.sql` from `src/lib/seed` (single source of truth for defaults) |
| `psql -f tests/sql/supabase_stub.sql` + migrations + `tests/sql/smoke.sql` | Validates the schema, RLS, audit triggers and portal RPCs on plain PostgreSQL |

## Architecture

```
src/
  app/(app)/…            Staff application (auth-gated): dashboard, leads, customers, estimates,
                         measurements, projects, schedule, change-orders, team, inventory,
                         finance, documents, reports, automations, settings
  app/portal/[token]     Customer portal (secure tokenized link, no login)
  app/inquiry            Public website inquiry form (embeddable)
  lib/types.ts           Domain model: 33 tables, mirrors the SQL schema 1:1
  lib/calc.ts            Pure business math (unit-tested)
  lib/store.ts           Normalized client cache, optimistic writes, realtime merge, audit trail
  lib/backends/          local.ts (IndexedDB + BroadcastChannel) · supabase.ts (PostgREST/Realtime/Storage)
  lib/services.ts        Cross-module workflows: every lifecycle transition lives here
  lib/automation.ts      Trigger → conditions → actions engine (+ email/SMS delivery hook)
  lib/portal.ts          Portal adapter (local store or token-scoped Supabase RPCs)
  lib/pdf.ts             Branded proposal / invoice / change-order PDFs
  lib/analytics.ts       Dashboard and report aggregations
  components/            UI kit, shell, charts, forms, sketch pad, file manager, editors
supabase/migrations/     Schema, RLS + portal RPCs + storage + realtime, default seed
```

Every screen reads from one shared store through `useTable` / `useSnapshot`. A customer is created once and is then referenced by leads, estimates, projects, invoices, payments, files and messages, so all modules stay consistent.

## Data model (core relationships)

```
customers ─┬─< leads ──< activities
           ├─< estimates ──< estimate_items        (catalog_items / estimate_templates feed these)
           │       └─1 projects ─┬─< project_tasks (task / checklist / punch)
           │                     ├─< project_updates (daily log, customer-visible flag)
           │                     ├─< change_orders (items jsonb: add / modify / remove)
           │                     ├─< measurements (dims + sketch polygon)
           │                     ├─< events (calendar; crew_id, employee_ids)
           │                     ├─< time_entries >─ employees >─< crews
           │                     ├─< expenses >─ suppliers
           │                     ├─< purchase_orders >─ suppliers ── stock_movements >─ inventory_items
           │                     └─< invoices ──< payments
           ├─< files (estimate / project / measurement scoped, shared_with_customer)
           └─< messages (portal chat)
profiles >─ roles(permissions[])   automations ──< automation_runs   notifications   audit_logs
```

## Key workflows

| Event | What happens automatically |
|---|---|
| Website inquiry submitted | Customer is matched by email or phone (or created), a high-priority lead lands in **New Lead**, and the sales team is notified |
| Estimate created from a lead | Lead moves to **Estimate in Progress**. Quantities can come from site measurements, with a waste factor |
| Estimate sent | Lead moves to **Estimate Sent**, a follow-up reminder is scheduled, and the proposal appears in the portal |
| Customer signs in the portal | Estimate is approved and locked, the **project is created** (scope, contract value, estimated cost, payment schedule), lead is marked **Won**, the PM is notified, and measurements and files carry over |
| Milestone invoice paid (deposit) | Invoice status is recalculated and the project advances to **Deposit Received** |
| PO placed / fully received | Project moves to **Materials Ordered** / **Materials Delivered**. Stock and job material cost are posted |
| Change order approved | Contract value, estimated cost and end date are updated. The final milestone absorbs the difference |
| Project → Completed | A draft final invoice is created and the office is notified |
| Invoice passes its due date | Status changes to **Overdue** and the office is notified (hourly sweep) |
| Installation within 48 h | Customer reminder goes through the email/SMS hook and is logged to the communication history |

All of these are editable rules in **Automations** (enable/disable, conditions, extra actions).

## Security

- **Authentication:** Supabase Auth in cloud mode. In local mode, accounts use PBKDF2-SHA256 hashed passwords.
- **Role-based access:** 7 default roles plus custom roles, each with 27 configurable permissions. These are enforced in the UI and, in the cloud, by PostgreSQL RLS (`has_perm()`).
- **Customer portal:** an unguessable 48-hex-character token per customer. It is served only through `security definer` RPCs that never return internal costs, markups or notes. Anonymous users have no table access. The link can be regenerated at any time.
- **Audit trail:** a database trigger records inserts, updates (field-level diff) and deletes on financial and contract records.
- **Backups:** Supabase manages daily backups and PITR. Local mode keeps 7 automatic daily snapshots, and a JSON export/import is available in *Settings → Data*.

## Integration points (ready, not connected)

- **Stripe:** `payments.processor` / `external_ref`. Replace `portal_pay_invoice` with Stripe Checkout plus a webhook Edge Function that inserts the payment.
- **QuickBooks:** `invoices.external_ref`. Sync invoices, payments and expenses through an Edge Function.
- **Email / SMS:** `setDeliver()` in `src/lib/automation.ts`. Plug in Resend, Postmark or Twilio.
- **Production automations:** they run in the client today. Move `fire()` to a Supabase Edge Function driven by database webhooks so they also run when no staff browser is open.

## Notes and limitations

- In local mode, data lives in one browser profile. Use Supabase for a real multi-user deployment.
- The portal's "Pay" button records a payment directly (demo processor) and collects no card data. Connect Stripe before taking real payments.
