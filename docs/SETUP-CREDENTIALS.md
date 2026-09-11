# Setting up credentials

This project is built so that **no credential is ever required to run it**: with nothing
configured it stores records in the browser (IndexedDB) behind the same policy, validation
and alert engine as the hosted build. Adding credentials swaps the implementation, not the
code.

Never paste a service-account JSON, a Cloudinary API secret, a private key or an SMS auth
token into a chat, an issue, a commit or a screenshot. This document tells you *which*
variable to set and *where* it belongs — the values stay in your secret store.

## 1 · Firebase project

**Required for hosted data, Auth and push.**

1. Create the project in the Firebase console, then add a **Web app** to get the config.
2. Enable **Authentication → Email/Password**, and add the hosting domain to
   *Authorised domains*.
3. Enable **Cloud Firestore** (production mode) and **Firebase Messaging** — generate a
   **Web Push certificate** (VAPID key) under *Project settings → Cloud Messaging*.
4. Put the public values in `web/.env.local`:

   ```
   VITE_FIREBASE_API_KEY=…            # web config, public by design
   VITE_FIREBASE_AUTH_DOMAIN=…
   VITE_FIREBASE_PROJECT_ID=…
   VITE_FIREBASE_STORAGE_BUCKET=…
   VITE_FIREBASE_MESSAGING_SENDER_ID=…
   VITE_FIREBASE_APP_ID=…
   VITE_FIREBASE_VAPID_KEY=…          # web push certificate, public
   ```

5. Deploy the rules and indexes from the repository root:

   ```bash
   firebase use mamacare-33821      # or your project id, see .firebaserc
   firebase deploy --only firestore:rules,firestore:indexes
   ```

   `firestore.rules` is the real enforcement layer — the client-side policy module is not
   sufficient on its own, and a deployment without these rules is not secure.

**Service account (API service only).** Do **not** download the JSON into the repository.
Give the API service either
• ambient credentials (Cloud Run / Firebase Functions service agent — preferred, nothing to
store), or
• `GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/outside/the/repo/mamacare-admin.json` on a
VM, with the file owned by the service user and mode `0400`.

The Admin SDK needs these roles on the service account: *Cloud Datastore User*,
*Firebase Authentication Admin*, and *Cloud Messaging Sender* for push.

**First administrator.** There is no self-service ADMIN. Either
• set `BOOTSTRAP_ADMIN_EMAILS=someone@yourdomain.org` on the API service, have that person
sign up and press *Claim administrator access*, then remove the variable; or
• set custom claims manually in the console: Authentication → Users → *Edit custom claims*
→ `{"role":"ADMIN","accountStatus":"ACTIVE","privilegeVersion":1767000000000}`, then have
them sign in again.

## 2 · Cloudinary (all media)

**Public imagery (landing photos, education covers, facility photos).**

1. In Cloudinary add an **upload preset** of mode *unsigned* whose folder is `mamacare`.
   Name it and expose it to the browser:
   ```
   VITE_CLOUDINARY_CLOUD_NAME=your-cloud
   VITE_CLOUDINARY_UPLOAD_PRESET=mamacare_unsigned
   ```
   The app uploads to `mamacare/public|education|branding|facilities` under that preset.
   Folders are created on first upload; nothing has to be pre-made.

**Private media (mother portraits, clinical documents, reports).**

2. On the **API service** only, set the server-side trio:
   ```
   CLOUDINARY_CLOUD_NAME=your-cloud
   CLOUDINARY_API_KEY=…           # never in the browser
   CLOUDINARY_API_SECRET=…        # never in the browser, never in the repo
   CLOUDINARY_ROOT_FOLDER=mamacare
   MAX_UPLOAD_BYTES=20971520
   ```
   The client asks `POST /api/media/sign` for a signature when the target folder is
   `documents`, `reports` or `profiles`; the service validates the folder, public id, size and
   MIME type before signing, and `access_mode=authenticated` is requested so a stored asset is
   not world-readable.

3. To read a private asset back, the client calls `POST /api/media/sign-url`. The service
   looks up the document/report row that references the public id and applies its access list
   (`accessRoles`, `accessUserIds`, owning mother, owning facility) before returning a URL that
   expires in minutes. There is no path by which the browser receives the secret.

**Delete:** `POST /api/media/delete` — allowed for the uploader or an admin, destroys the
asset and records a tombstone (`deletedAt`, `deletedBy`) plus an audit entry.

**Folder map** (fixed in `web/src/services/media/cloudinary.ts`, mirrored server-side):

| Folder | Contents | Delivery |
| --- | --- | --- |
| `mamacare/public` | landing and information photography | unsigned preset, CDN-cacheable |
| `mamacare/education` | article covers | unsigned preset |
| `mamacare/branding` | logo and icon uploads | unsigned preset |
| `mamacare/facilities` | facility photographs | unsigned preset |
| `mamacare/profiles` | mother and staff portraits | **signed** upload + signed delivery |
| `mamacare/documents` | lab results, consent scans, referral letters | **signed** upload + signed delivery |
| `mamacare/reports` | generated PDFs | **signed** upload + signed delivery |

## 3 · SMS reminders (optional, provider-approved only)

Nothing is sent unless you configure a provider the facility is contracted with:

```
SMS_PROVIDER=twilio           # or: http | queue-only | none
SMS_FROM_NUMBER=+260…
TWILIO_ACCOUNT_SID=…
SMS_AUTH_TOKEN=…              # API service only
```

`http` posts `{to,text,reference}` with `Authorization: Bearer $SMS_API_KEY` to
`SMS_ENDPOINT_URL`, for a national aggregator or an in-country gateway. `queue-only` writes
the request to `sms_outbound` for an external sender; `none` disables SMS and the interface
says so. The queue is drained by `POST /api/jobs/sms-drain`, called from a cron with
`x-scheduler-token: $SCHEDULER_INTERNAL_TOKEN`; rows are claimed with a status transition so
two overlapping runs cannot double-send, and attempts are capped before a row goes to
`FAILED_PERMANENT`.

Message text is composed server-side from the appointment record, contains the date/time and
the clinic's instruction to call, and never a result or a diagnosis.

## 4 · Contact-form relay (optional)

```
SUPPORT_INBOX_EMAIL=help@yourdomain.org
SUPPORT_FROM_ADDRESS=no-reply@yourdomain.org
EMAIL_RELAY_ENDPOINT=https://…            # any HTTPS JSON relay
EMAIL_RELAY_API_KEY=…
```

Without these, a submission is stored in `contact_messages` and the visitor is offered a
mailto fallback — the form never claims an email was sent when it wasn't.

## 5 · Verifying a configuration

```bash
cd functions && npm run build && node -e "
const {redactedSummary}=await import('./dist/env.js');console.log(redactedSummary())"
curl -s localhost:8787/health | jq
```

`/health` reports `degraded[]` naming exactly what is missing (e.g. `cloudinary`,
`sms: not configured so reminders will be queued, not delivered`), never a secret value.
The web app prints the same summary to the console at boot and shows an integration notice on
the dashboard while something is unwired — so a half-configured deployment is visible instead
of silently half-working.

## 6 · Rotating or removing access

* **Lost phone / leaked password:** Admin → Users → *Revoke all sessions*
  (`auth.revokeRefreshTokens` + `privilegeVersion` bump), then *Send password reset*.
* **Departing staff member:** Admin → Users → deactivate (never delete — the audit trail and
  clinical attribution must survive).
* **Rotating the Cloudinary secret:** update the API service's secret, redeploy, and re-run
  an upload; the browser never held the old value.
* **Rotating the VAPID key:** regenerate in Firebase, update `VITE_FIREBASE_VAPID_KEY`,
  redeploy hosting, and re-register devices (existing tokens stop working; the app prunes
  them when FCM reports them invalid).
* **Full reset of a device-mode browser:** DevTools → Application → IndexedDB → delete
  `mamacare-local`, then reload (this also clears the demonstration dataset).
