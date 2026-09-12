# MAMA CARE

**Better Maternal Care. Connected.**

A maternal-health platform for Zambian clinics: a public information site, a health-worker
workspace (registration, ANC visits, alerts, referrals, appointments, documents, reports),
a mother’s own portal, and an administrator console — one Firebase data layer, one access
policy, one audit trail.

```
mamacare/
├── web/                    # React 19 + Vite + TypeScript + Tailwind v4 (the whole product)
│   ├── src/services/       # data layer, policy, auth, media, clinical rules, reports, admin
│   ├── src/routes/         # public site · auth · /app workspace · /admin console · /home portal
│   ├── src/components/     # UI kit, layout shells, charts, media, clinical cards
│   └── scripts/            # icon rasteriser (no external image tooling needed)
├── functions/              # API service: signed uploads, custom claims, SMS/push, queue jobs
├── firestore.rules         # the same access matrix, enforced by the database
├── firestore.indexes.json  # composite indexes for every query the app issues
├── firebase.json           # hosting, security rules, emulators
└── docs/                   # architecture, credentials setup, clinical & security validation
```

---

## Run it

```bash
cd web
npm install
npm run dev            # http://localhost:5173
```

That is the whole loop for a first look. With no cloud credentials configured the app
runs against **this browser’s IndexedDB** through the same data-provider interface,
policy module and alert engine that the hosted build uses — so the clinical workflow can
be clicked through end to end without a Firebase project. It seeds a small demonstration
dataset on first run (facilities, staff accounts, mothers, visits, alerts, referrals,
appointments) so there is real data to interact with. Sign in with any of the seeded
accounts listed on the administrator overview (or in `web/src/services/demo/dataset.ts`),
password `MamaCare!2026`.

Opt out of the demonstration data with `VITE_LOCAL_DEMO_SEED=false`.

### Switch to Firebase

```bash
cd web
cp .env.example .env.local      # fill in VITE_FIREBASE_* from your Firebase project
npm run dev                     # detects the keys and uses Firestore + Firebase Auth
```

No code change, no new screen: `src/config/env.ts` picks the provider, and
`services/data/firestore-provider.ts` replaces `services/data/local/provider.ts`.
Then deploy the rules: `firebase deploy --only firestore:rules,firestore:indexes`.

> The rules are the enforcement layer, and a rules file that does not compile is not
> deployed at all — the project silently keeps its previous rules. The rules language has
> no loop construct, so this file expresses "did this patch touch a privileged field?"
> with `Map.diff().affectedKeys().hasAny([…])`. `npm test` in `web/` checks the file for
> constructs the compiler rejects, because there is no emulator in CI.

### Deploying the site

`web/` is a single-page application: every route must be served `index.html`, and the
build output must actually reach the host. Two supported paths:

* **Vercel** — `vercel.json` is committed (root, and again inside `web/` for a project
  whose Root Directory is that folder), so no dashboard build settings are needed.
* **Firebase Hosting** — `firebase.json` serves `web/dist` and rewrites `/api/**` to the
  Cloud Run service.

Both are described, with the environment variables each host needs, in
[`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) — including what a Vercel `404: NOT_FOUND`,
a blank page, or *"the database refused the profile write"* actually mean.

### The API service (optional but needed for privileged work)

```bash
cd functions
npm install
cp .env.example .env            # Cloudinary secret, Admin credentials, SMS keys
npm run dev                     # http://127.0.0.1:8787  (the Vite dev server proxies /api → here)
```

Without it the app still works; anything that requires a secret is **reported as
unavailable instead of faked**: uploads fall back to device storage, and SMS reminders are
queued with a stated reason. See [`functions/README.md`](functions/README.md).

### Scripts

| Where        | Command              | What it does                                              |
| ------------ | -------------------- | --------------------------------------------------------- |
| `web/`       | `npm run dev`         | Vite dev server (host `0.0.0.0`, port 5173, `/api` proxy) |
| `web/`       | `npm run typecheck`   | `tsc --noEmit`, strict + `noUncheckedIndexedAccess`        |
| `web/`       | `npm test`            | Vitest (happy-dom) unit tests                              |
| `web/`       | `npm run build`       | typecheck then production bundle into `web/dist`           |
| `web/`       | `npm run icons`       | regenerates PWA/app icons from `public/icons/icon.svg`     |
| `functions/` | `npm run dev`         | API service with reload (`tsx watch`)                      |
| `functions/` | `npm run typecheck`   | server-side typecheck                                      |

---

## What is implemented

**Public site** (`/`) — hero, About, Services, Maternal-health guidance, Emergency
guidance, FAQ, Privacy, Contact. This is the first screen; the sign-in page is a route
like any other, never a landing wall. Exactly sixteen primary maternal-health images are used
across the site through one reusable `<AppImage>` component (lazy loading, `srcSet`,
blur-up placeholder, Cloudinary delivery with a local fallback).

**Authentication** — register, sign in/out, forgot/reset password, change password,
update profile, deactivate. Roles come from Firebase custom claims
(`ADMIN`, `FACILITY_SUPERVISOR`, `MIDWIFE`, `NURSE`, `COMMUNITY_HEALTH_WORKER`, `MOTHER`).
Self-registration can never request `ADMIN`; an unapproved health worker lands on a pending
screen and every privileged read stays blocked until an administrator approves the
account.

**Health-worker workspace** (`/app`) — today’s workload dashboard; mother roster with
search and filters; the mother profile (identity, patient ID, GA, EDD, risk status,
actions and ten tabs: overview, identity & contact, pregnancy & history, ANC visits,
vitals & growth, appointments, alerts, referrals, documents, reports); structured ANC
visit entry with the 13 danger signs plus “other” and “none reported”; the alert register
with response workflow; referral register on the nine-status workflow; appointment
register with today/upcoming/overdue/missed views and a reminder queue; documents;
reports; education library; notifications; own profile.

**Administrator console** (`/admin`) — platform overview, the approval queue, user
directory with role/facility/status changes and session revocation, facility directory,
system settings including the clinical rule set with per-rule sign-off, and the audit
log with CSV export. Mother/appointment/alert/referral/document/report screens are the same
components as `/app`, mounted in the admin scope — no second implementation.

**Mother’s portal** (`/home`) — her pregnancy at a glance, appointments, her own record
(visit measurements, documents and reports shared with her), reading chosen for her stage
and language, messages, and account settings. She only ever sees her own rows, and
nothing clinical is interpreted for her: wording stays “your clinic would like to see you”,
never a diagnosis.

**Media** — one Cloudinary service (`web/src/services/media/`) with folder organisation
`mamacare/{public,profiles,reports,documents,facilities,education,branding}`, validation
before upload, real progress, secure delivery URLs, and delete. Unsigned preset for public
imagery (browser direct); **signed** policy for patient documents, reports and portraits,
which goes through the API service because the API secret never reaches the client. If
Cloudinary is not configured, bytes are stored on-device under the same logical keys so
the workflow stays testable — and the interface says so plainly.

**Notifications** — in-app inbox is the source of truth; browser push (FCM) is an extra
channel per device, requested at runtime (no token is ever hard-coded or committed); SMS
reminders are queued through the API service to an approved provider only.

---

## Security model, in one page

| Concern                  | Where it is enforced                                                                 |
| ------------------------ | ----------------------------------------------------------------------------------- |
| Who may read a row        | `firestore.rules` (database) **and** `web/src/services/policy/policy.ts` (device provider + UI) |
| Who may write what        | same pair, evaluated on the *merged* row so an update cannot escape its scope        |
| Roles                   | Firebase custom claims, written only by the API service with the Admin SDK          |
| Privilege changes         | `/admin/users/role` on the API service, admin-only, reason required, audited         |
| Patient document access   | signed, expiring delivery URLs from the API service; the record’s access list decides |
| Secrets                 | server environment only (`functions/.env`); nothing secret in the browser bundle      |
| Errors                  | one mapping module (`web/src/lib/errors.ts`): raw Firebase/provider errors are never shown to users |
| Input                     | zod schemas per form and per route, shared between client and API                    |
| Rate limiting             | API service per IP and per route group; contact form additionally honeypot + dwell   |
| Audit                     | append-only `audit_logs`, no clinical payloads in metadata, written on every meaningful action |

Frontend role checks exist **only** to decide what to render. `web/src/types/domain.ts`
and the policy module are the human-readable description of the matrix;
`docs/SECURITY-VALIDATION.md` lists the test cases that must pass before real use.

---

## Clinical safety

* Alert rules are **data** (`alert_rules` collection, seeded from
  `web/src/services/clinical/rules.ts`), configurable per deployment, versioned, and each
  one carries a `approvedBy` / `approvedAt` sign-off field.
* Alert wording is never diagnostic: “*Potential danger sign identified. Immediate
  clinical assessment required.*” The engine reports that a recorded value matched a
  configured threshold; it does not claim a condition.
* The administrator settings screen shows exactly how many rules are still unsigned, and
  refuses to look like a validated protocol while any are unreviewed.
* **Before real clinical use, a qualified clinician must validate the thresholds,
  wording, response times and escalation paths**, and the deployment must record that
  review (`docs/SECURITY-VALIDATION.md`). Aggregate reporting contains no patient
  identifiers, and a mother sees only her own data.

---

## Configuration

Two `.env.example` files describe every variable, who reads it, and what happens when it
is missing:

* [`web/.env.example`](web/.env.example) — public browser values (Firebase web config,
  Cloudinary cloud name + unsigned preset, support contacts, emergency numbers,
  provider override, VAPID key).
* [`functions/.env.example`](functions/.env.example) — server secrets (Cloudinary API key +
  secret, Admin SDK credential path, SMS provider, email relay, bootstrap administrator
  allow-list, scheduler token).

No service-account JSON, private key or API secret belongs in this repository, in a log
line, or in a chat message. If a credential is missing, the integration interface is still
complete and the interface names the variable that is missing.

## Documentation

* [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — layers, data flow, provider contract, why the device provider exists.
* [`docs/SETUP-CREDENTIALS.md`](docs/SETUP-CREDENTIALS.md) — Firebase, Cloudinary, SMS, push, first administrator, deploy.
* [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) — hosting configuration, environment variables, the role model in Firestore, and troubleshooting (404 at the edge, the interface's 500 page, refused profile writes).
* [`docs/SECURITY-VALIDATION.md`](docs/SECURITY-VALIDATION.md) — access matrix tests, clinical rule validation checklist, go-live gate.
