# Securing & validating MAMA CARE v2 for real deployment

The current offline layer is an **engineering prototype**. This is the
checklist that must be completed — and verified — before any real patient
record is collected.

## 1. Data protection (engineering)

- [ ] **Encrypt local storage.** Replace plain SQLite with SQLCipher (or
      `sqflite` + platform-level encryption), key held in Android Keystore.
      A lost/compromised phone must not expose patient records.
- [ ] **Session hardening.** 15-minute inactivity auto-logout (present),
      plus: session revocation API, device registry, MFA for admin,
      per-user API keys, anomaly alerts on auth.
- [ ] **Input validation everywhere** — client, Edge Function, and DB checks
      (CHECK constraints on BP ranges, weights, ages).
- [ ] **Least privilege re-audit.** RLS policies reviewed per role;
      `authenticated` grants audited; no `bypassrls` for app-facing roles.
- [ ] **Controlled exports.** CSV export only from the supervisor dashboard,
      PII-masked by default, full PII only behind an explicit "include
      identifiers" flag that writes an audit log entry.
- [ ] **Backups & retention.** Supabase PITR enabled; retention schedule
      defined; deletion procedure tested.
- [ ] **Remote wipe / revocation.** If the platform supports device
      management, enroll the worker phones; otherwise enforce
      "sign out of all sessions" on lost-device reports.
- [ ] **Dependency & SBOM review.** `flutter pub deps`, `npm audit`,
      Supabase library versions pinned; update cadence documented.

## 2. Sync hardening (engineering)

- [ ] Idempotency proven end-to-end (duplicate-upsert tests, network kills
      mid-transfer, clock skew).
- [ ] Retry with exponential backoff + jitter and a per-entity dead-letter
      queue surfaced in Settings → Sync.
- [ ] Conflict policy review with clinical informatics: current default is
      **server-wins on field conflict** with the local delta preserved in
      `sync_conflicts`; confirm that matches clinical workflow (especially
      referral status transitions, which should be *monotonic* — a referral
      can never silently regress from "admitted" back to "active").
- [ ] Full offline coverage: every clinical table (medications, tests,
      follow-ups, deliveries) written locally first, in parent→child order.
- [ ] Integrity check on sync: hash the local row and compare after upsert to
      detect partial writes.

## 3. Privacy & legal (Zambia)

- [ ] **Data Protection Impact Assessment (DPIA)** before go-live.
- [ ] Legal review against applicable Zambian law — including the Data
      Protection Act and health-sector requirements — and alignment with
      Ministry of Health processes for digital health data.
- [ ] Data Processing Agreements with Supabase and the SMS provider.
- [ ] Consent workflow: informed consent captured at registration (stored
      with timestamp + consent version), withdrawal path defined.
- [ ] Data minimization audit: is every field we collect strictly needed?
      Phone numbers are required for reminders — document that basis.
- [ ] Breach response runbook (detect → contain → notify → document).
- [ ] Roles for accountability: data owner, data protection officer,
      clinical lead, IT security lead.

## 4. Clinical validation (point of care)

- [ ] **Danger-sign rules** in `alert_rules` reviewed and signed off by
      qualified maternal-health professionals (obstetrician, midwife lead)
      and the implementing health authority, mapped to the current national
      ANC/obstetric guideline version in use.
- [ ] **ANC visit schedule** (recommended next-appointment spacing) validated
      against the national guideline; make it configurable per facility.
- [ ] **Observations checklist** aligned to what the facility actually records
      (the app includes an "other locally required observations" free-text
      field for the gap).
- [ ] Pilot: 2–3 facilities, 8–12 weeks, with concurrent paper recording and
      reconciliation of alerts/missed visits.
- [ ] Usability testing with the actual user group (CHWs, midwives, nurses,
      supervisors) including low-literacy workflow checks and large-button
      interaction on the danger-sign screen.
- [ ] Go-live criteria: sync success rate, offline day coverage, time-per-visit
      vs. paper, and zero unresolved data-integrity incidents.

## 5. Operational

- [ ] Staff training + job aids (one-page quick cards per role).
- [ ] Support channel and escalation path (who fixes a stuck sync?).
- [ ] Monitoring: Supabase dashboard alerts (auth failures, p95 latency,
      SMS failure rate), app crash reporting (non-PII only).
- [ ] Versioning: semver for app, changelog per release, staged rollout
      (1 facility → 1 district → province → national).
