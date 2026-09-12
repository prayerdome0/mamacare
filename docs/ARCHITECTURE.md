# Architecture

MAMA CARE is one React application plus a small privileged API service. The split is
deliberate: everything that can be done with a user's own credentials happens in the
client against a documented provider interface; everything that needs a secret goes
through the API service.

```
                    ┌───────────────────────────────────────────────┐
                    │  web/  (React 19 + Vite + Tailwind v4)         │
                    │                                                │
   browser ───────► │  routes/      public · auth · /app · /admin · /home │
                    │  components/  ui kit · layout · charts · media │
                    │  hooks/       useAsync · useLiveQuery · forms  │
                    │  services/                                     │
                    │   ├ data/        provider contract + 2 impls    │
                    │   ├ policy/      the access matrix (authority)  │
                    │   ├ clinical/    rules (data) + engine (pure)   │
                    │   ├ auth/ media/ reports/ dashboard/ admin/     │
                    │   ├ notifications/ demo/                         │
                    │   └ api/client.ts ── /api/* ──┐                 │
                    └────────────────────────────────│────────────────┘
                                                     │  ID token
                    ┌────────────────────────────────▼────────────────┐
                    │  functions/ (Express; Cloud Run or Functions v2) │
                    │  signed uploads · custom claims · FCM · SMS ·    │
                    │  audit · contact form · queue drains              │
                    └───────┬───────────────────┬──────────────────────┘
                            │                   │
              ┌─────────────▼──────┐   ┌────────▼─────────────┐
              │ Cloud Firestore +  │   │ Cloudinary, SMS       │
              │ Firebase Auth      │   │ provider, FCM         │
              │ (rules enforced)   │   └───────────────────────┘
              └────────────────────┘
```

## The provider contract

`web/src/services/data/contract.ts` is the seam the whole app is built on:

```ts
interface DataProvider {
  readonly kind: 'firebase' | 'local';
  get/list/create/update/remove/subscribe(…, actor)   // every call carries the actor
  transaction(work: (tx: TxHandle) => Promise<T>): Promise<T>
}
```

Two implementations satisfy it:

| | `firebase-provider.ts` | `local/provider.ts` |
| --- | --- | --- |
| storage | Cloud Firestore | IndexedDB (`mamacare-local`) |
| queries | `where`/`orderBy`/`limit` translated from `QuerySpec` | the same `QuerySpec` evaluated by `query-engine.ts` |
| live data | `onSnapshot` | `store.subscribe` (local writes plus cross-tab `storage` events) |
| authorisation | `firestore.rules` | `policy.ts` executed on every read and write |
| transactions | `runTransaction` | staged writes, all-or-nothing commit |

`services/session-store.ts` picks the implementation from `config/env.ts`: Firebase when
the project keys are complete, device storage otherwise, with `VITE_DATA_PROVIDER` as an
explicit override. No screen, hook or service knows which one is active — that is what makes
the fallback real rather than a demo mode.

**Why the device provider exists.** It keeps the clinical workflow testable (registration →
visit → alerts → referral → report) without a deployed backend, and it doubles as the
policy's test bench: because the same `policy.ts` gates every local read and write, an
escalation that would be rejected in production is also rejected here.

## Data flow for one ANC visit

1. `visit-dialog.tsx` collects structured observations and danger signs; `useForm` +
   `ancVisitSchema` validate before anything is sent.
2. `data-layer.createVisit` loads the mother and active pregnancy, allocates the visit
   number, derives gestational age, and builds the observation snapshot.
3. `alert-engine.evaluateRules(rules from `alert_rules`, snapshot)` returns matched rules —
   pure, no I/O, wording copied from the rule rows.
4. Inside one `provider.transaction`: the visit, the pregnancy risk update, the mother's
   denormalised snapshot, one alert row per matched rule, notifications for the assigned
   officer, and the audit entry are written together.
5. `useLiveQuery` subscribers (roster, dashboard, alert register) update from the snapshot
   listener; the mother receives the in-app notification and, where configured, a push.

If step 4 fails anywhere, nothing is written — there is no half-recorded visit.

## Clinical rules as data

`services/clinical/rules.ts` ships the starting set (`RULES_VERSION = 3`, ~30 rules with
AND/OR criteria groups and gestational windows). The `alert_rules` collection holds the
deployment's copy: thresholds, wording, recommended action, enabled flag, version and the
`approvedBy` / `approvedAt` sign-off fields. Editing a rule in Admin → Settings → Clinical
rules creates a new version; the alert keeps the `ruleKey` and `ruleVersion` that produced
it, so a historical alert can always be explained.

## Access decisions

`services/policy/policy.ts` answers two questions for every operation — `canReadRow` and
`canWrite` (evaluated on the merged before+patch row so an update cannot escape its scope) —
and `permissionsFor` for the UI. The same matrix exists in `firestore.rules` and, for the
privileged subset, again in the API service's route guards. The three copies are the point of
`docs/SECURITY-VALIDATION.md`: a change to one must be reflected in the others, with tests.

Roles (`ADMIN`, `FACILITY_SUPERVISOR`, `MIDWIFE`, `NURSE`, `COMMUNITY_HEALTH_WORKER`,
`MOTHER`) come from Firebase custom claims, written only by the API service. `privilegeVersion`
in the claims is compared against the profile document on every privileged request, which is
what makes deactivation and role changes take effect immediately.

## Media

`services/media/cloudinary.ts` owns folder structure (`mamacare/{public,profiles,reports,
documents,facilities,education,branding}/…`), URL building with `f_auto,q_auto` and srcset,
and the two upload paths: unsigned preset for public imagery, signed through
`POST /api/media/sign` for patient documents, reports and portraits. Private assets are
delivered through short-lived signed URLs requested from `POST /api/media/sign-url`, which
first resolves the document row that references the public id and applies its access list.

`services/media/blob-store.ts` is the fallback object store used by the device provider, with
the same keys and folder semantics, so an upload works the same way with or without Cloudinary.

## Rendering and state

* `providers/app-providers.tsx` — session context, toast host, confirm dialog, integration notices.
* `hooks/index.ts` — `useAsync` (loading/error/retry with a `retryable` flag),
  `useMutation`, `useLiveQuery` (policy-scoped subscription), `useForm` (schema-backed with
  dirty tracking and a double-submit guard).
* `components/layout/shell.tsx` + `nav-scope.tsx` — one shell for staff, admin and mother
  workspaces; `NavScope` supplies the nav and the link base, which is why `/admin` can mount
  the same registers as `/app` without duplicating a file.
* Route-level `React.lazy` chunks per surface; Firestore, jsPDF and Cloudinary code are
  separate manual chunks (see `web/vite.config.ts`).

## Deliberate omissions

* No Redux or react-query: the provider + hooks layer is the data abstraction, and one
  policy module must remain the only authority.
* No mock data source. The only generated content is the clearly labelled demonstration
  dataset, written through the real services in device mode.
* No offline write queue in the service worker: only the messaging worker ships
  (`src/sw/firebase-messaging-sw.ts`, built by `plugins/firebase-sw.ts`).
* No Firebase Storage — media is Cloudinary's job here, and rules never reference a bucket.
