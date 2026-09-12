# Deploying MAMA CARE (and diagnosing sign-in problems)

This document covers the two supported ways to put the product online, what each
environment variable does, and what to check when registration or sign-in fails in
production. It is written so that a deployment problem can be found from the
running site (`/status`), the browser console and the provider's dashboard.

---

## 1 · What gets deployed

| Piece | What it is | Where it runs |
| --- | --- | --- |
| `web/` | the whole product: public site, staff workspace, mother portal, admin console | any static host: **Vercel** (configured in `vercel.json`), **Firebase Hosting**, Netlify, S3+CDN |
| `functions/` | privileged API: custom claims, signed uploads, SMS/push, contact relay | Cloud Run / Firebase Functions v2 (or a Node process). Called at `/api/*` |
| Firestore + Auth | data, identity, `firestore.rules` enforcement | Firebase project `.firebaserc` → `mamacare-33821` |

The web app is a single-page application. **Every route must be served
`index.html`** and the client router takes over; a host that answers `404` for
`/signin` or `/register` looks exactly like "the app is broken".

---

## 2 · Vercel

The repository ships two copies of the same configuration — a root `vercel.json` and
`web/vercel.json`. Vercel reads the one that sits in the project's **Root Directory**, so
either dashboard setting works without further changes:

```json
{
  "framework": null,
  "installCommand": "cd web && npm ci",
  "buildCommand": "cd web && npm run build",
  "outputDirectory": "web/dist",
  "rewrites": [{ "source": "/((?!api/).*)", "destination": "/index.html" }]
}
```

* `framework: null` stops Vercel from looking for a Next.js app in the repository
  root — there is none, and a build with nothing to serve is what produced Vercel's own
  `404: NOT_FOUND` edge page for **every** URL, including `/`.
* The rewrite sends every path that is not `/api/*` to `index.html`, which is what
  makes `/signin`, `/register`, `/app/...` and `/admin/...` work as deep links.
* `outputDirectory` (`web/dist`, or `dist` in `web/vercel.json`) must match what
  `npm run build` emits. If it does not, the deployment publishes an empty directory
  and every URL — including `/` — is a 404 again.

### Environment variables (Vercel → Project → Settings → Environment Variables)

Build-time values are **inlined into the bundle**, so they must be present for the
build that serves production, and any change needs a re-deploy (not just a restart).

| Variable | Value |
| --- | --- |
| `VITE_FIREBASE_API_KEY` | Firebase web config (Project settings → Your apps) |
| `VITE_FIREBASE_AUTH_DOMAIN` | `<project>.firebaseapp.com` |
| `VITE_FIREBASE_PROJECT_ID` | e.g. `mamacare-33821` |
| `VITE_FIREBASE_STORAGE_BUCKET` | `<project>.appspot.com` |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Firebase web config |
| `VITE_FIREBASE_APP_ID` | Firebase web config |
| `VITE_FIREBASE_VAPID_KEY` | optional, browser push |
| `VITE_DATA_PROVIDER` | `firebase` once the six values above are set |
| `VITE_DEFAULT_COUNTRY` | `ZM` (default) |
| `VITE_DEFAULT_CURRENCY` | `ZMW` (default) |
| `VITE_DEFAULT_DIAL_CODE` | `+260` (default) |
| `VITE_SUPPORT_EMAIL` / `VITE_SUPPORT_PHONE` | shown on the public site |
| `VITE_PUBLIC_URL` | the deployed origin, e.g. `https://mamacare-two.vercel.app` |
| `VITE_API_BASE_URL` | `/api` when the API is proxied on the same origin, otherwise the absolute URL of the Cloud Run service |

With **no** Firebase variables the build runs on device storage (IndexedDB) — the
full application, with a demonstration dataset — and `/status` says so. That is a
supported mode for evaluation, not a failure: it is reported, never hidden.

### Firebase Authentication must know the domain

Firebase console → Authentication → Settings → **Authorised domains** → add the
Vercel domain (`mamacare-two.vercel.app`, plus `localhost` for development).
Without it, sign-in and password reset fail with `auth/unauthorized-domain`, which
the app shows as *"This website address is not authorised for sign-in…"*.

Also confirm Authentication → Sign-in method → **Email/Password** is **enabled**.
If it is not, the SDK returns `auth/configuration-not-found` and the app says so
in plain language.

### Preview deployments

Vercel previews get a new hostname each time. Either add each preview domain to
Firebase's authorised domains, or use the **Production** deployment when testing
sign-in.

---

## 3 · Firebase Hosting (alternative)

`firebase.json` already builds `web/dist`, rewrites everything to
`/index.html`, and proxies `/api/**` to the Cloud Run service `mamacare-api`:

```bash
cd web && npm run build
cd .. && firebase deploy --only hosting,firestore:rules,firestore:indexes
```

Deploy the rules whenever `firestore.rules` changes — the client policy module is
not the enforcement layer, the rules are.

---

## 4 · The API service

```bash
cd functions
cp .env.example .env      # Admin credentials, Cloudinary, SMS, scheduler token
npm run dev               # http://127.0.0.1:8787, the dev server proxies /api
```

On a static host such as Vercel there is no Node runtime, so `/api/*` has no
backend unless one is placed in front of it. Two options:

1. **Deploy `functions/` to Cloud Run** and set
   `VITE_API_BASE_URL=https://<service-url>/api`, then add the Vercel origin to
   `ALLOWED_ORIGINS` on the service.
2. Leave it out. The app still works: uploads fall back to device storage, SMS
   reminders queue with a stated reason, and **role synchronisation** (below) is
   reported as unavailable instead of failing silently.

---

## 5 · Roles: Firestore is the source of truth

```
users/{uid}
{
  name:    "Chanda Mwale",
  email:   "chanda@example.org",
  role:    "admin"          // or "user", "midwife", "nurse", "chw", "supervisor"
}
```

* A new account is created with the least-privileged role (`MOTHER` / normal
  user) and, for health workers, `status: "PENDING_APPROVAL"`. Registration can
  never request or grant `admin`.
* The interface reads that document to decide which dashboard opens and which
  pages appear. Roles are accepted in either case and with common aliases
  (`admin`, `Administrator`, `user`, `patient`, `chw`, …).
* Firestore **custom claims** — the copy the security rules enforce — are minted
  by the API service from the same document. When the document changes (for
  example, you set `role: "admin"` in the Firebase console), the account's next
  sign-in calls `POST /api/auth/sync-claims`, the claims are re-minted and the
  session token is refreshed. `/status` shows the stored role with a *Re-read my
  role from the database* button if you do not want to sign out.

**Making the first administrator:** set `role: "admin"` on that account's
`users/{uid}` document in the Firebase console, then sign in. Nothing in the
front-end contains an administrator email address, and no client can write its own
`role` field (the rules refuse it).

`firestore.rules` enforcement of the same matrix:

* `users/{uid}` — a person may read and edit their own contact details, never
  their `role`, `status`, `privilegeVersion`, `accountKind` or `motherId`; only an
  administrator may change those.
* clinical collections — facility-scoped; a mother sees only rows carrying her own
  `motherId`; nothing is deletable.
* `counters/{id}` — patient-id allocation only, forward-only, never deletable.
* everything not listed — denied (`match /{document=**} { allow read, write: if false }`).

---

## 6 · Troubleshooting: "500" and other failures seen in production

| Symptom | What it actually is | Fix |
| --- | --- | --- |
| Vercel's own `404: NOT_FOUND` on every URL | the deployment contained nothing to serve: no build output, or an `outputDirectory` that does not match the build | deploy with the committed `vercel.json`; check the deployment's build log for the emitted directory |
| Nothing renders at all — a blank white page, no error text | the JavaScript bundle threw while it was still being evaluated, which happens before any error screen exists | fixed: Firebase Auth is now acquired on first use rather than at module load, so a build without Firebase variables runs in device mode instead of failing to boot |
| `404` on `/signin` or `/register` but `/` works | missing SPA rewrite | keep the `rewrites` rule above |
| A full-page **"500 — unexpected error"** when opening sign-in, registering or signing in | a render-time exception. Sign-in and registration were the only screens that touched `localStorage` *while rendering*, and a browser that refuses storage (Safari private windows, partitioned iframes, blocked cookies) made that read throw inside render — the error boundary then replaced the page with its 500 screen. All storage access now goes through `src/lib/storage.ts`, which never throws and falls back to in-memory storage | update to this build; the same screens now render and warn that the session will not persist (`web/src/App.smoke.test.tsx` renders both screens with storage refusing to confirm it) |
| **"Your account could not be set up because the database refused the profile write"** | `firestore.rules` could not be deployed, so the project still enforces an older rule set. The rules language has no loop construct; an earlier revision used `for (let key in keys)` and therefore **never compiled** | `firebase deploy --only firestore:rules` from this repository — the loops are now expressed with `Map.diff().affectedKeys().hasAny([…])`, and `npm test` in `web/` guards against a reintroduction |
| `auth/configuration-not-found`, *"Email and password sign-in is not enabled…"* | Email/Password provider disabled in Firebase Authentication | enable it in the console |
| `auth/unauthorized-domain` | the deployed domain is not on Firebase's authorised list | add it under Authentication → Settings → Authorised domains |
| *"Your account could not be set up because the database refused the profile write"* | `firestore.rules` deployed from an older revision than the client | `firebase deploy --only firestore:rules` from this repository |
| *"The secure file service is unreachable"* | no API service on this host (`/api` has no backend on a static host) | deploy `functions/` and set `VITE_API_BASE_URL`, or accept device-storage uploads |
| *"Your permissions changed. Please sign in again."* | the stored `privilegeVersion` is newer than your token | sign in again; `/status` → *Re-read my role from the database* also fixes it |
| Everything works but the numbers look wrong | check `/status`: device mode reads this browser's demonstration dataset, not the project | set the `VITE_FIREBASE_*` variables and re-deploy |

Where to look when it is still unclear:

1. **`/status`** — provider, integration presence, missing environment variable
   *names*, your stored role, and a role re-read button.
2. **Browser console** — every provider failure is logged as
   `[mamacare] <operation> failed { code, name, message }`. Raw provider errors are
   deliberately kept out of the interface and kept in the log.
3. **Firebase console → Authentication → Users** — did the account actually get
   created? If the auth user exists but no `users/{uid}` document does, the
   document write was refused (rules) — the exact case above.
4. **Firestore → Rules → Playground** — replay a read/write against a real uid to
   see which rule denied it.
5. **Vercel → Deployment → Build logs** — a build that failed to install or
   typecheck serves nothing.

---

## 7 · Before you call it live

```bash
cd web && npm run typecheck && npm test && npm run build
cd ../functions && npm run typecheck
node scripts/responsive-audit.mjs --fail     # from web/ — no blocking overflow
```

Then, on the deployed site:

1. `/` opens and the content loads without signing in.
2. Register a new account → the confirmation appears, the account exists in
   Firebase Authentication **and** `users/{uid}` exists with `role: "MOTHER"`.
3. Sign out, sign in again → session persists across a page reload.
4. A wrong password produces *"Invalid email or password."*, not a raw code.
5. Set `role: "admin"` on that account in the console, sign in → the admin console
   opens (`/admin`) and `/admin/users` lists accounts.
6. With a normal user, open `/admin` → redirected to the "not permitted" page.
7. On a phone: no sideways scrolling on the landing page, sign-in, registration,
   the staff dashboard, the mother portal or the admin console.
