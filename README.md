# MAMA CARE

**Every Mother. Every Journey.**

A pregnancy, mother and baby care platform built for Zambia first and for the rest of
Africa next. It helps a mother track her pregnancy week by week, keep antenatal
appointments, remember medication and supplements, learn what is happening to her and
her baby, recognise danger signs, find a facility, immunise her child on schedule, and
continue into the postnatal period — with a clinician portal and an administration
dashboard behind it.

> ### Medical-safety principle
>
> **Mama Care does not diagnose.** Every screen that could be mistaken for clinical
> advice says so, in the place a person would read it rather than in a footer. The
> platform records what a mother or her clinician enters, teaches from reviewed
> guidance, organises appointments and reminders, and routes emergencies to a phone
> number and a facility. Where a symptom could be dangerous, the app tells her to go
> and be seen — it never offers a conclusion of its own.

---

## Table of contents

1. [What is in the build](#what-is-in-the-build)
2. [Quick start](#quick-start)
3. [Demo accounts](#demo-accounts)
4. [Stack](#stack)
5. [How data and permissions work](#how-data-and-permissions-work)
6. [Media: two kinds of bytes](#media-two-kinds-of-bytes)
7. [Notifications, reminders and push](#notifications-reminders-and-push)
8. [Offline and device mode](#offline-and-device-mode)
9. [Configuration](#configuration)
10. [Route map](#route-map)
11. [Project structure](#project-structure)
12. [Deployment](#deployment)
13. [Security review](#security-review)
14. [Content provenance](#content-provenance)
15. [Languages](#languages)
16. [Scripts](#scripts)

---

## What is in the build

### Public site (no account needed)

Landing page with a calm animated "vitals" band (a slow ECG trace; pure CSS transform
work, no filters, and fully static when the visitor prefers reduced motion), the full
education library, individual articles, the facility directory with name/district/province
filters and directions — seeded with the researched Chama District (Muchinga Province)
facilities first —, the verified provider directory, a standalone emergency page with
Zambian short codes and the danger-sign checklist, plus About, How it works, FAQ,
Contact, Privacy, Terms and a live Status page that reports what this deployment
actually has configured.

### Mother app — `/app`

| Screen | What it does |
| --- | --- |
| Home | Week ring, today's reminders, next appointment, quick actions, unread notifications |
| Pregnancy tracker | LMP or ultrasound dating, EDD, trimester, symptoms, weight/BP/fundal-height observations, kick counter, routine ANC visit plan |
| Weekly guide | All 42 weeks: baby's development, what her body is doing, questions to ask, habits, warning signs, milestones |
| Appointments | Book, reschedule, complete, add questions, see clinician notes, suggested next visits |
| Reminders | Medication, supplements and custom reminders with times, frequency, refill-free scheduling and a taken/missed history |
| Baby | Birth record, growth entries, the Zambia EPI immunization schedule with dose-by-dose tracking, safe-sleep guidance, developmental stages month by month |
| Journal | Private notes, tagged, mood tracking, never visible to a provider or supporter |
| Learn | Education filtered to her stage (pregnancy, labour, postnatal, newborn) |
| Facilities | Directory with distance, maternity and 24-hour emergency filters, directions, phone |
| Messages | Threads with her care team and her supporters |
| Emergency | Audience-aware danger signs, "go now" card, numbers to call, what to do while waiting, and an incident record |
| Notifications | All/unread, per-category preferences, quiet hours, push toggle |
| Profile | Photo, care team, supporters, personal health documents, export |
| Settings | Notification preferences, family support, password, data export and account deletion, language, storage diagnostics |

Postnatal mode is not a separate app: when a pregnancy is marked delivered, the same
shell re-orients around the baby, breastfeeding, recovery and the immunization
schedule, and the emergency content switches to postnatal danger signs.

### Healthcare provider portal — `/provider`

Dashboard (today's schedule, who needs attention, unread threads), patients (only those
with an active care link, plus pending requests), the individual record (pregnancy,
appointments, observations, babies and immunization — read-only where it belongs to the
mother), appointments with completion notes, an education writer with a structured block
editor, messaging, caseload reports with CSV export, and their own professional profile
with verification status and directory switches.

Getting there is an application, not a switch: anyone with an account opens
`/become-a-provider` and submits name, contact, location, facility, profession,
licence/registration number, qualifications and optional supporting documents. That
creates a `providers` record in `pending` state linked to the applicant's own user id —
nothing else changes, and the record carries no privilege. An administrator approves or
rejects from Admin → Nurse applications; approval flips the user's profile to the
`PROVIDER` role (with `providerId`, `privilegeVersion` bump and a notification) and
stamps the verified badge. Rejection sends the reason back to the applicant, who can
correct the details and re-submit from the same page.

### Administration — `/admin`

Dashboard with live counts (accounts, providers to verify, **verified nurses**,
facilities, open reports) and a triage list, accounts (role and status), the nurse
application queue (view, approve, reject, manage — approving grants the provider role
and the verified badge), the verified-nurses view, facility directory (including
importing the built-in list and verifying contact details by phone), article review and
publishing, announcements, broadcast notifications, appointment oversight, content
reports, feedback, media and storage, the audit log, and platform settings.

---

## Quick start

```bash
cd web
npm install
npm run dev
```

Open the printed URL. That is the whole setup: the Firebase and Cloudinary
configuration for this project is committed as defaults in `web/src/config/env.ts`, so
the app boots connected to Firebase (Auth, Firestore, Storage). If the Firebase config
is absent or `VITE_DATA_PROVIDER=local`, the same app runs in device mode — IndexedDB,
local passwords and the seeded demo accounts — with no code changes.

To run against your own Firebase project instead, copy `web/.env.example` to
`web/.env.local` and fill in the values — then deploy the rules:

```bash
firebase deploy --only firestore:rules,firestore:indexes,storage
```

---

## Demo accounts

Seeded on the first run of a device-mode install (`VITE_LOCAL_DEMO_SEED=true`, the
default). Password for all four: `mamacare123`.

| Email | Role |
| --- | --- |
| `demo@mamacare.health` | Mother, pregnant |
| `baby@mamacare.health` | Mother, postnatal with a baby |
| `provider@mamacare.health` | Healthcare provider |
| `admin@mamacare.health` | Administrator |

The demo seed only runs in device mode. On a Firebase deployment you create real
accounts, and the first administrator is either an email listed in
`VITE_BOOTSTRAP_ADMIN_EMAILS` or somebody given the `role: ADMIN` custom claim.

---

## Stack

- **React 19 + TypeScript + Vite 7**, Tailwind CSS 4, React Router 7
- **Firebase** — Authentication, Firestore, Storage, Cloud Messaging
- **Cloudinary** — unsigned uploads for public imagery (cloud `mk2tulbt`, preset `Mamacare`)
- **Zod** for every form and every write that crosses a boundary
- **Vitest** for the pure logic (obstetric maths, validation, storage, geo, errors, ids)

No backend service. There is no server to operate, no queue to monitor and no secret to
rotate: the browser talks to Firebase and Cloudinary directly, and authorisation lives
in `firestore.rules` and `storage.rules`.

---

## How data and permissions work

Three layers, and they must agree:

1. **`web/src/services/policy/policy.ts`** — the in-app decision module. Every read and
   write through the data layer is checked here first, so the device build behaves
   exactly like the hosted one and a denied action produces a human sentence rather than
   a stack trace.
2. **`firestore.rules`** — the enforcement layer. Mirrors the policy module rule for
   rule. This is the one that matters: it stands between a crafted request and somebody
   else's pregnancy record.
3. **`web/src/services/data/*`** — one `DataProvider` interface with two implementations
   (Firestore and IndexedDB). Repositories in `services/repositories.ts` are the only way
   the UI touches data, so a screen never knows which provider it is on.

Roles are `MOTHER`, `SUPPORTER`, `PROVIDER`, `FACILITY_ADMIN`, `ADMIN`. The role is read
from the Firebase custom claim when it exists and from the profile document otherwise, in
both the rules and the app, so a deployment works before claims are wired up. Nobody can
promote themselves: `role`, `status` and `privilegeVersion` are not writable by their own
account.

The rules that carry the design:

- **A mother owns her health data.** She can always read it, write it and delete it.
- **A clinician reaches a patient only through an active care link.** The mother grants
  it; the clinician may only request one, and may withdraw a request they made. Revoking
  is immediate.
- **The journal, personal documents, notifications and devices are excluded from every
  sharing path.** There is no setting that exposes them.
- **A supporter sees only the categories the mother switched on** — appointments,
  reminders, education, milestones — individually.
- **Publishing education is an administrator action.** Providers write drafts; a second
  clinician publishes, and the reviewer and date are stored on the article.
- **Everything consequential is written to an append-only audit log** with actor, role,
  target and detail. Audit entries can be created and read by administrators, never
  updated or deleted by anyone.

Two document ids are deterministic so a rule can answer *"is this clinician linked to this
patient?"* with a single `exists()` instead of a query it cannot run:

```
care_links/{motherUserId}__{providerUserId}
supporters/{motherUserId}__{supporterEmail}
```

---

## Media: two kinds of bytes

| | Public imagery | Personal health documents |
| --- | --- | --- |
| Examples | Education covers, facility photos, profile pictures, branding | Scans, lab results, prescriptions, birth records, child health cards |
| Storage | Cloudinary (unsigned preset) | Firebase Storage, `mamacare/documents/{uid}/…` |
| Access | Anyone with the URL | Owner only, plus administrators |
| Fallback | IndexedDB blob on this device | IndexedDB blob on this device |

The split is enforced in `services/media/media-service.ts`, not left to the caller:
`uploadImage()` can only reach the public library and `uploadDocument()` can only reach
the sensitive folder, which is why a profile photo can never end up in a place a CDN
caches and a scan can never end up in a place a stranger can guess. Deleting an image
queues its public id in an orphan list (Admin → Media) because an unsigned browser upload
cannot delete its own asset.

---

## Notifications, reminders and push

- **In-app notifications** are records in Firestore/IndexedDB, listed on
  `/app/notifications`, with per-category preferences and quiet hours the person sets.
- **The reminder engine** (`services/reminders.ts`) collects what is due, de-duplicates
  through an IndexedDB key so nothing fires twice, and respects quiet hours.
- **Web push** uses Firebase Cloud Messaging with the VAPID key committed as a default.
  `pushState()` reports honestly — `unsupported`, `unconfigured`, `default`, `denied`,
  `granted`, `error` — and the UI says which one it is instead of pretending a toggle
  worked.
- **Broadcasts** (Admin → Notifications) write one notification per recipient, show the
  count before sending, and are logged with the sender's name. They cannot be recalled.

---

## Offline and device mode

The app is a PWA: installable, with a manifest, icons and a service worker. When Firebase
is not configured — or when `VITE_DATA_PROVIDER=local` — everything runs in this browser's
IndexedDB, including authentication (PBKDF2-SHA256, 150k iterations, per-account salt) and
media (stored as blobs). That is not a degraded demo path; it is how a clinic tablet with
no connectivity still works, and the same repositories, the same policy module and the
same screens are used either way. Admin → Media shows the storage mode, the browser's
estimate, whether storage is persisted, and a per-collection record count.

---

## Configuration

Every variable is optional and documented in [`web/.env.example`](web/.env.example). The
groups: data provider, Firebase web config, push VAPID key, Cloudinary, branding,
support and privacy contacts, market defaults (`ZM` / `ZMW` / `+260`), emergency numbers,
and operations (bootstrap administrator emails, demo seed).

The public Status page (`/status`) and Admin → Settings both report which variables are
present and what changes when one is missing — never their values.

---

## Route map

```
/                       landing                     /learn                 library
/learn/:slug            article                     /learn/category/:name  topic
/facilities             directory                   /providers             clinicians
/emergency              public emergency page       /about /how-it-works /faq
/contact /privacy /terms /status                    *                      not found

/sign-in /register /forgot-password /pending /home
/become-a-provider      apply for nurse / provider verification (any signed-in account)

/app                    home            /app/pregnancy      tracker
/app/guide              weekly guide    /app/appointments   visits
/app/reminders          medication      /app/baby           baby & immunization
/app/journal            private notes   /app/learn          education
/app/facilities         directory       /app/messages       care team
/app/emergency          danger signs    /app/notifications  alerts
/app/profile            you             /app/settings       preferences & data

/provider               dashboard       /provider/patients        caseload
/provider/patients/:id  record          /provider/appointments    visits
/provider/education     writer          /provider/messages        threads
/provider/reports       caseload        /provider/profile         you

/admin                  dashboard       /admin/users          accounts
/admin/providers        verification    /admin/facilities     directory
/admin/articles         content         /admin/announcements  banners
/admin/notifications    broadcast       /admin/appointments   oversight
/admin/reports          content reports /admin/feedback       messages
/admin/media            media & storage /admin/audit          log
/admin/settings         platform
```

Guards decide where you land; policy and rules decide what you may read. A provider who
types `/app/pregnancy` is sent to their own portal — and could not read that record from
either URL.

---

## Project structure

```
web/src/
  config/       env, weekly guide (42 weeks), immunization schedule, baby
                development, built-in articles, Zambia facilities, site copy
  types/        the domain model — one file, every entity and union
  services/
    data/       provider contract, Firestore + IndexedDB implementations,
                query engine, local seed data
    policy/     the permission module mirrored by firestore.rules
    auth/       registration, profile lookup, local + Firebase adapters
    media/      Cloudinary, Firebase Storage, blob fallback, routing, orphans
    repositories.ts  the only way the UI reads or writes
    session-store.ts provider selection, session, diagnostics, account deletion
    audit.ts    append-only log
    push.ts     FCM state machine     reminders.ts  due-item engine
  components/   ui/ (design system), layout/ (shells), plus pregnancy,
                emergency, facility, content and message components
  routes/       public/ auth/ mother/ provider/ admin/ + guards
  lib/          obstetric maths, validation schemas, date/format/csv utils,
                storage wrappers, error taxonomy, ids — with tests
firestore.rules  firestore.indexes.json  storage.rules  firebase.json
```

---

## Deployment

**Firebase Hosting** (recommended — the rules, indexes and the site deploy together):

```bash
cd web && npm ci && npm run build
cd .. && firebase deploy
```

`firebase.json` serves `web/dist`, rewrites every path to `index.html`, caches hashed
assets immutably, and sets `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`
and a `Permissions-Policy` that denies geolocation, microphone and camera.

**Vercel** also works via the committed `vercel.json` (build in `web/`, output
`web/dist`, SPA rewrite, the same headers).

Before going live:

1. Add your authorised domains in the Firebase console.
2. Deploy `firestore.rules`, `firestore.indexes.json` and `storage.rules`.
3. Set the `role: ADMIN` custom claim for your first administrator.
4. Import and verify the facility directory (Admin → Facilities → Import built-ins).
5. Review the built-in education library and publish anything you have checked locally.

---

## Security review

Read `firestore.rules` before you deploy — it is the security model, and it is commented
so each rule says who it is for. What is covered:

- Owner-only health records; clinician access gated on an active care link; journal,
  documents, notifications and devices excluded from every sharing path.
- Self-service roles only at registration; `role`, `status` and `privilegeVersion` not
  writable by their own account.
- Provider records can only be **born `pending`** — with no `verifiedBy`, `verifiedAt`
  or `rejectionReason` — so an applicant cannot self-publish a "verified" status at
  creation time (the one exception is a deployment whose global settings document has
  explicitly turned approvals off, where registration may create an approved record,
  still without a `verifiedBy` name). The device policy module enforces the identical
  rule offline.
- The only status change an applicant can make to their own provider record is a
  **re-submission after a rejection** (`rejected` → `pending`, clearing the reason).
  No client-side path reaches `approved`; only an administrator's write can.
- Providers may write drafts but cannot publish or delete content.
- Messages are immutable apart from read state, and cannot be deleted — report instead.
- Audit log is append-only: create for the actor, read for administrators, never update.
- Storage rules cap upload size and content type, and scope personal documents to their
  owner's path prefix.
- Passwords: 10 characters minimum with a capital letter and a digit, enforced by one
  policy object shared by the schema, the device auth adapter and the UI copy.
- No secrets in the bundle. The Firebase web config is public by design; Cloudinary uses
  an unsigned preset; there is no server holding a key.

**One known limitation, stated plainly.** The public provider directory must be listable
by a visitor who has not registered, and Firestore evaluates a `list` query as a whole
rather than per document — so a crafted query against `providers` can read rows the UI
filters out, including pending applicants and their licence numbers. Detail reads are
still restricted, and the exposure is limited to that one collection. The fix before a
public launch is to move `licenseNumber`, `status`, `verifiedBy`, `verifiedAt` and
`rejectionReason` into an admin-only `providers/{id}/verification/{id}` subcollection and
keep the directory document to what a patient should see. It is a contained change:
`providerRepo.approve/reject` and the admin provider screen are the only writers.

---

## Content provenance

- **42-week pregnancy guide** (`config/weekly-guide.ts`) — written against routine
  antenatal guidance, with a warning-sign block on every week that carries one.
- **Immunization schedule** (`config/immunization.ts`) — Zambia's EPI routine: BCG, OPV0
  and HepB at birth; OPV/Penta/PCV/Rota at 6, 10 and 14 weeks with IPV at 14; vitamin A
  at 6 and 9 months; MR1 at 9 months and MR2 at 18 months — plus the maternal Td schedule.
  The label is editable in Admin → Settings so a deployment can name the schedule it
  actually follows.
- **22 built-in articles** (`config/articles.ts`) spanning pregnancy, nutrition, antenatal
  care, activity, rest, wellbeing, labour, postnatal, newborn, breastfeeding and
  immunization. They cannot be deleted; publishing your own version with the same slug
  replaces them everywhere.
- **~55 Zambian facilities** (`config/facilities.ts`), all arriving **unverified** — an
  administrator confirms each by phone before it is trusted. The list opens with the
  researched **Chama District, Muchinga Province** set: Chama District Hospital
  (commissioned 2016, the district's main referral facility, with the public directory
  phone number), Chama Rural Health Centre, Mundalanga Clinic, and the district's rural
  health centres and health posts (Sitwe, Mwalala, Mwila, Nthonkho, Pondo, Tembwe,
  Chibote, Chitondo, Kabanda, Kabila, Kanengo, Kala). Names, towns and provinces were
  checked against the WHO Zambia health facility register, 2020 Lusaka Times coverage
  and public map directories; phone numbers and exact coordinates were left empty
  wherever nothing public and verifiable exists, rather than guessed.
- **Routine ANC visit plan** — eight milestones at 12, 20, 26, 30, 34, 36, 38 and 40 weeks.

Content is educational. It is not a substitute for a qualified professional, and every
article carries the reviewer's name and a review date so stale guidance gets flagged
instead of quietly persisting.

---

## Languages

English is live. Bemba, Nyanja, Tonga and Lozi are structured throughout the domain model
(`LanguageCode`, the `LANGUAGES` table, a language field on every account, article and
notification) and selectable in the interface, where they are marked *coming soon*. Adding
a translation is a content task, not a refactor: nothing in the data model assumes English.

---

## Scripts

```bash
cd web
npm run dev         # Vite dev server (bound to all interfaces, any host allowed)
npm run build       # typecheck, then a production build with per-route chunks
npm run typecheck   # tsc --noEmit
npm run test        # vitest: obstetrics, validation, storage, geo, errors, ids
npm run preview     # serve the production build
npm run icons       # regenerate PWA icons
```
