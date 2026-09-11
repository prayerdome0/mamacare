# MAMA CARE v2

A two-sided maternal-health system for Zambian facilities:

1. **`app/`** — Secure Android (Flutter) app for health workers (MVP). Offline-first, syncs to Supabase.
2. **`dashboard/`** — Next.js web dashboard for facility supervisors (Vercel-ready).
3. **`supabase/`** — PostgreSQL schema (with RLS), SMS-reminder Edge Function, seed data.
4. **`docs/`** — Architecture, credential setup, and security/clinical validation plan.

The mother-facing module is intentionally **not** in v2 scope — the health-worker app is the MVP.

---

## Repository layout

```
mamacare/
├── app/                        # Flutter (Android/iOS) health-worker app
│   ├── lib/
│   │   ├── main.dart           # Composition root / service wiring
│   │   ├── app.dart            # MaterialApp, auth gate
│   │   ├── config/             # App config from --dart-define (no hardcoded keys)
│   │   ├── core/               # Theme, constants
│   │   ├── models/             # Mothers, pregnancies, visits, vitals, alerts…
│   │   ├── services/
│   │   │   ├── auth_service.dart        # Supabase email/password + session timeout
│   │   │   ├── local_db/database.dart   # SQLite offline store (mirrors Postgres)
│   │   │   ├── data_repository.dart     # Local-first CRUD (works offline)
│   │   │   ├── sync/sync_engine.dart    # Idempotent sync queue + conflict policy
│   │   │   ├── clinical/alert_engine.dart   # Configurable danger-sign rules
│   │   │   ├── clinical/gestational_math.dart # LMP → GA + EDD
│   │   │   └── reminders/reminder_service.dart
│   │   └── ui/                 # The 12 MVP screens + shell
│   └── android/                # Android manifest/gradle scaffolding
├── dashboard/                  # Next.js supervisor dashboard (deploy to Vercel)
│   ├── app/                    # Login, Overview, Mothers, Alerts, Reports
│   ├── lib/                    # Supabase client + demo-mode data source
│   └── components/
├── supabase/
│   ├── migrations/20260911000000_init.sql   # Full schema, RLS, triggers, alert rules
│   ├── functions/sms-reminders/index.ts     # SMS reminder Edge Function (Deno)
│   └── seed.sql
└── docs/
    ├── ARCHITECTURE.md
    ├── SETUP-CREDENTIALS.md
    └── SECURITY-VALIDATION.md
```

## Quick start

### 1. Dashboard (works instantly in demo mode)

```bash
cd dashboard
npm install
npm run dev            # http://localhost:3000 — demo data, no credentials needed
```

Set `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` (`.env.local`) to
switch from demo data to live data. Deploy to Vercel by importing this repo and
setting the **Root Directory** to `dashboard`.

### 2. Supabase backend

```bash
# In your Supabase project
supabase db push                      # applies supabase/migrations
supabase functions deploy sms-reminders --no-verify-jwt
supabase functions secret set SMS_PROVIDER        # "twilio" or "http"
supabase functions secret set SMS_INTERNAL_TOKEN  # shared secret for cron calls
# provider secrets, e.g. for Twilio:
supabase functions secret set TWILIO_ACCOUNT_SID
supabase functions secret set TWILIO_AUTH_TOKEN
supabase functions secret set TWILIO_FROM_NUMBER
```

Schedule the reminder job (Supabase Cron, daily 07:00 facility time):

```sql
select cron.schedule('sms-reminders-daily', '0 7 * * *',
  $$ select net.http_post(url: '<project-url>/functions/v1/sms-reminders',
     headers: jsonb '{"Authorization":"Bearer <SMS_INTERNAL_TOKEN>","Content-Type":"application/json"}',
     body: jsonb '{"windowHours":48}') $$);
```

### 3. Flutter app

```bash
cd app
flutter create . --platforms=android   # regenerate platform scaffolding if absent
flutter pub get
flutter run \
  --dart-define=SUPABASE_URL=https://xxxx.supabase.co \
  --dart-define=SUPABASE_ANON_KEY=eyJ...
```

See `docs/SETUP-CREDENTIALS.md` for the full list of variables and where each one lives.

## What is wired up in v2

- ✅ Real Supabase authentication (email/password), role + facility scoping via RLS
- ✅ Persistent PostgreSQL patient records (mothers → pregnancies → visits/vitals/signs/tests)
- ✅ Local SQLite storage — full offline capture of registration, visits, alerts, referrals
- ✅ Idempotent offline sync queue (client-generated UUIDs, `row_version` conflict policy)
- ✅ Configurable clinical alert engine (RED / AMBER / GREEN — never auto-diagnoses)
- ✅ Appointments with reminder schedule + SMS Edge Function framework
- ✅ Missed-visit detection + CHW follow-up records
- ✅ Referral lifecycle (active → received → assessment → treatment → discharge / onward)
- ✅ Supervisor dashboard with demo mode and live-mode data source
- ✅ Environment-variable configuration everywhere — no hard-coded credentials

## What must happen before real patient data

This is an engineering prototype. Before collecting real patient records:

1. **Encrypt local storage** (SQLCipher) — SQLite is currently unencrypted.
2. **Harden sync**: retry with exponential backoff, per-entity dead-letter, full offline
   coverage of every clinical table, conflict arbitration review.
3. **Privacy/legal review** for Zambia — data-protection impact assessment,
   alignment with applicable Zambian health-data requirements and Ministry of Health
   processes (see `docs/SECURITY-VALIDATION.md`).
4. **Clinical validation** — the seeded danger-sign rules and ANC schedule must be
   reviewed and approved by qualified maternal-health professionals and the
   implementing health authority before use at point of care.

> The alert engine deliberately says *"Potential danger sign — clinical assessment
> required."* It never tells a nurse they are looking at pre-eclampsia.
