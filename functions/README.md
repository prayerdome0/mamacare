# MAMA CARE API service

The only place secrets live. The browser bundle never sees a Cloudinary API secret, a
service-account key or an SMS token — anything that requires one is a call to this service.

```
src/
├─ index.ts        entrypoint: standalone HTTP server, or the same app exported as a
│                  Firebase Functions v2 onRequest handler (`api`)
├─ app.ts          middleware order, route mounting (both `/api/...` and `/...`), /health
├─ env.ts          validated environment + redactedSummary() for logs
├─ http.ts         ApiError, zod body parsing, fixed-window rate limit, security headers,
│                  error mapper (no stack traces, no provider internals in responses)
├─ firebase.ts     Admin SDK bootstrap from env only; ID-token verification with a
│                  privilege-version check against the profile document
├─ cloudinary.ts   folder policy, upload signing, signed expiring URLs, destroy
├─ messaging.ts    FCM multicast + SMS provider adapters (twilio | http | queue-only)
├─ audit.ts        audit_logs writer (shared shape with the web client)
├─ routes/
│  ├─ _auth.ts     requireAuth / optionalAuth / requireRoles
│  ├─ media.ts     POST /media/sign · /media/sign-url · /media/delete · GET /media/policy
│  ├─ admin.ts     /admin/users/{role,status,approve,create,revoke,password-reset} · /admin/bootstrap
│  ├─ notifications.ts  /notifications/{push,sms,announce}
│  └─ contact.ts   POST /contact (public, hardened) · GET /contact/topics
└─ jobs/queue.ts   SMS outbox drain, stale-send reclaim, sweep notifications
```

## Running it

```bash
npm install
cp .env.example .env      # set only what this deployment actually has
npm run dev               # http://127.0.0.1:8787  (the Vite dev server proxies /api here)
npm run typecheck
npm run build && npm start
```

The web app works without this service: media falls back to device storage and SMS reminders
stay queued, each with a message naming the missing configuration. Starting it enables the
parts that cannot be done from a browser.

## Endpoints

| Route | Auth | What it does |
| --- | --- | --- |
| `GET /health` | none | status + `degraded[]` + redacted configuration (never secret values) |
| `POST /media/sign` | signed in | signs an upload into `mamacare/<folder>`; refuses folders outside the policy and oversized/mistyped files |
| `POST /media/sign-url` | signed in | expiring signed delivery URL, **after** checking the document/report row that references the asset |
| `POST /media/delete` | owner or admin | destroys the stored asset, marks the row deleted, audits it |
| `POST /admin/users/role` | admin | writes custom claims + bumps `privilegeVersion`, reason required |
| `POST /admin/users/status` | admin | deactivate / reinstate (never your own account) |
| `POST /admin/users/approve` | admin | clears `PENDING_APPROVAL` and issues claims |
| `POST /admin/users/create` | admin | creates a staff account with correct claims and a forced password change |
| `POST /admin/users/revoke` | admin | `revokeRefreshTokens` + privilege bump |
| `POST /admin/bootstrap` | signed in | first-run administrator; only an address in `BOOTSTRAP_ADMIN_EMAILS`, rate-limited, audited |
| `POST /notifications/push` | staff | FCM to that user's registered device tokens; prunes tokens FCM reports dead |
| `POST /notifications/sms` | staff | composes and sends/queues an appointment reminder (never trusts a client-supplied phone number for an appointment) |
| `POST /notifications/announce` | supervisor/admin | in-app + push broadcast to a facility |
| `POST /contact` | none | public contact form: rate-limited, honeypot + dwell time, stored in Firestore, relayed only if configured |
| `POST /jobs/sms-drain` | scheduler token or admin | drains the SMS outbox with retries and stale-claim reclaim |
| `POST /jobs/sweep-notified` | scheduler token or admin | tells the facility team what a missed-appointment sweep changed |

## Rules this service follows

* **Roles come from verified custom claims.** A `role` in a request body is ignored.
* **Every privilege change is audited** with a written reason, and the audit write cannot
  fail the user-facing request (it is logged instead).
* **Revocation is real:** `privilegeVersion` on the profile is compared with the token on
  every authenticated call, so a demoted or deactivated account stops working at its next
  request rather than at token expiry.
* **Errors are mapped, never leaked:** the response carries a safe message and a code; the
  provider detail stays in the service log.
* **Nothing is faked.** Missing `CLOUDINARY_API_SECRET` → 503 naming the variable. Missing
  `SMS_PROVIDER` → the reminder is queued with the reason, not marked sent.

## Cron

```
*/15 * * * * curl -fsS -X POST https://<host>/api/jobs/sms-drain \
               -H "x-scheduler-token: $SCHEDULER_INTERNAL_TOKEN"
```

Or call the same route with an administrator's bearer token. `firebase.json` schedules
nothing on its own by design — a deployment decides whether an unattended sender is
appropriate for its data-protection rules.
