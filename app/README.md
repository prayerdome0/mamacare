# MAMA CARE — health-worker app (Flutter)

Offline-first Android app for midwives, nurses, and community health workers.

## Run

```bash
flutter create . --platforms=android   # (re)generate platform scaffolding if missing
flutter pub get

# development — with your Supabase project
flutter run \
  --dart-define=SUPABASE_URL="https://<ref>.supabase.co" \
  --dart-define=SUPABASE_ANON_KEY="<anon-key>"
```

Without `--dart-define` values the app still runs (login is disabled with a
clear notice) — local SQLite capture works, sync is off.

## Screens (MVP set of 12)

| # | Screen | File |
|---|--------|------|
| 1 | Splash | `lib/ui/screens/splash_screen.dart` |
| 2 | Login (email/password, session timeout) | `lib/ui/screens/login_screen.dart` |
| 3 | Dashboard (urgent / review / today / missed) | `lib/ui/screens/dashboard_screen.dart` |
| 4 | Register Mother (2 steps) | `lib/ui/screens/register_mother_screen.dart` |
| 5 | Pregnancy Details | `lib/ui/screens/pregnancy_details_screen.dart` |
| 6 | Mother Profile (timeline, risk, actions) | `lib/ui/screens/mother_profile_screen.dart` |
| 7 | New ANC Visit (A/B/C sections) | `lib/ui/screens/new_anc_visit_screen.dart` |
| 8 | Danger-Sign Screening (section C + alert panel) | same as 7 |
| 9 | Alert / Referral | `lib/ui/screens/alert_referral_screen.dart` |
| 10 | Appointments (today + missed follow-ups) | `lib/ui/screens/appointments_screen.dart` |
| 11 | Search Mothers | `lib/ui/screens/search_mothers_screen.dart` |
| 12 | Reports | `lib/ui/screens/reports_screen.dart` |

(+ Settings: `lib/ui/screens/settings_screen.dart`)

## Architecture notes

- **Local-first:** every write lands in SQLite (`services/local_db`) and is
  enqueued in `sync_queue`; reads come from the local store.
- **Idempotent sync:** client-generated UUIDs + `upsert on id`;
  `row_version` conflict check (server-wins, local delta recorded).
- **Alert engine:** rules are data (`alert_rules` table, cached locally);
  evaluated on-device so alerts work offline. Non-diagnostic wording only.
- **Auth:** Supabase email/password, least-privilege default role, 15-min
  inactivity timeout, "sign out of all sessions" for lost devices.

## Tests

```bash
flutter test
```

## Before real patient data

See `../docs/SECURITY-VALIDATION.md` — encrypted local storage (SQLCipher),
sync hardening, privacy/legal review (Zambia), and clinical validation are
required.
