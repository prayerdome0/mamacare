# MAMA CARE v2 — Architecture

## System overview

```
                    ┌─────────────────────────────────────────────┐
                    │                Supabase                      │
┌──────────────┐    │  ┌─────────────┐  ┌──────────────────────┐  │
│  Android app  │◄──┼──┤  Postgres   │  │  Edge Functions      │  │
│  (Flutter)    │    │  │  + RLS      │  │  sms-reminders (Deno)│  │
│  offline-first│    │  └─────────────┘  └──────────┬───────────┘  │
│  SQLite local │    │  ┌─────────────┐             │              │
└──────────────┘    │  │ Supabase Auth│             ▼              │
                    │  │ email/pw     │     SMS gateway (Twilio /  │
┌──────────────┐    │  └─────────────┘     any HTTP provider)     │
│  Web dashboard│◄───┼─────────────────────────────────────────────┤
│  (Next.js)    │    └─────────────────────────────────────────────┘
│  on Vercel    │
└──────────────┘
```

## 1. Data model (PostgreSQL)

Core ownership chain (IDs, never names, are the keys):

```
users (auth.users)
 ├── profiles        role + facility_id   (auto-created on sign-up)
 └── facilities      district/province

mothers             mother_code MC-000245 (server-assigned, canonical)
 └── pregnancies     LMP → EDD, status lifecycle
      ├── anc_visits ── vitals
      │               ── danger_signs
      │               ── tests
      │               ── medications
      ├── appointments  reminder_days, status
      ├── referrals     full lifecycle incl. receiving-facility updates
      ├── follow_ups    missed-visit outreach records
      ├── deliveries    → pregnancy flips to delivered → postnatal
      └── alerts        raised by the alert engine, status-tracked
```

Support tables: `alert_rules` (configurable clinical rules), `notifications`,
`sms_logs`, `audit_logs`.

Key design decisions:

- **Client-generated UUIDs.** Every row's `id` is a UUIDv4 minted on the device
  *before* the row exists, so offline records upsert idempotently: retrying the
  same sync operation never creates duplicates.
- **`row_version` + `updated_at` triggers.** Every update bumps `row_version`.
  The sync engine compares versions to detect conflicts.
- **Soft deletes.** `mothers.deleted_at`; clinical tables are append/update only.
- **Server-assigned canonical `mother_code`** (`MC-000245` sequence) so two
  offline devices can never mint the same code. Devices show a provisional
  code until first sync.

## 2. Offline-first flow (the critical path)

```
REGISTER / ANC VISIT (no internet)
   │  1. write row to local SQLite (client UUID)
   │  2. run alert engine locally (rules cached from alert_rules)
   │  3. enqueue record in sync_queue
   ▼
INTernet returns
   │  4. SyncEngine drains queue in parent→child order
   │     (mothers → pregnancies → visits → vitals/signs/tests →
   │      appointments → referrals → alerts)
   │  5. idempotent upsert by id  →  ✓ synced
   │  6. conflict? remote row_version > local → server-wins merge,
   │     local delta recorded in sync_conflicts for manual review
   ▼
Postgres (RLS enforced per row)
```

Sync status per record: `✓ synced / ⟳ syncing / ⚠ failed (retried with backoff)`.

## 3. Clinical alert engine

- Rules are **data, not code**: `alert_rules.rule_key, level, message,
  condition_json` in Postgres. Admins can amend rules when national guidelines
  change; the app downloads them on sync and evaluates them **locally**, so
  alerts work offline too.
- Condition JSON: `{"logic":"any"|"all","criteria":[{"field":"danger_sign","key":"…"}
  | {"field":"systolic_bp","op":"gte","value":160} | {"field":"weight_loss",…}]}`.
- Engine output wording is deliberately non-diagnostic:
  *"Potential danger sign — clinical assessment required."* (RED)
  *"Concerning finding — clinical review and follow-up required."* (AMBER)
  The app never names a diagnosis.
- Every fired rule becomes an `alerts` row (status `open`) → surfaced on the
  dashboard (`URGENT ALERTS`), the alerts tab, and the supervisor web view.
  Actions: ASSESS / REFER / DOCUMENT ACTION close the loop with an audit trail.

## 4. Roles & security (RLS)

| Role | App access | RLS scope |
|---|---|---|
| admin | users, facilities, settings, all data | all facilities |
| midwife / nurse | register, ANC, screening, referrals | own facility |
| chp (community health worker) | follow-ups, reminders, basic observations | own facility |
| supervisor | read-only reports & alerts | own district |
| mother | (phase 2) appointments, education, guidance | own records |

- Profiles are auto-provisioned on sign-up with **least privilege** (default `chp`);
  an admin elevates role/facility.
- `accessible_facility_ids()` + `pregnancy_visible()` centralize scoping; every
  clinical table's policies reference them.
- `sms_logs` and `audit_logs` have **no** client policies — service role only.
- Sessions: Supabase JWT + client-side inactivity timeout (15 min) + session
  revocation list (`device/session management` in Phase-2 hardening).

## 5. Reminders

- `appointments.reminder_days` (default `{7,1}`).
- In-app: local notifications for the assigned worker.
- SMS: `supabase/functions/sms-reminders` — internal-token protected, called by
  Supabase Cron daily; fetches appointments in the next 48 h, sends per-mother
  reminders, logs to `sms_logs`. Provider is pluggable (`twilio` or generic
  `http`). The gateway secret lives **only** in the Edge Function.

## 6. Web dashboard (Next.js)

- Runs in **demo mode** (deterministic generated data, no credentials) or
  **live mode** (`NEXT_PUBLIC_SUPABASE_URL` + anon key → RLS-scoped queries).
- PII minimization: aggregate views mask phone numbers; detailed mother rows
  are only reachable by staff whose RLS scope covers the facility.
- Deploy to Vercel with root directory `dashboard/`.

## 7. Phases

- **Phase 1 (this repo):** everything above — roles, registration, ANC, vitals,
  danger signs, alerts, appointments, missed visits, referrals, offline store,
  sync, basic reports, dashboard.
- **Phase 2:** mother-facing app, SMS reminders at scale, CHW follow-up workflow
  polish, delivery module, postnatal care, richer analytics.
- **Phase 3:** district dashboard, inter-facility referrals, HMIS integration,
  population-level analytics.
